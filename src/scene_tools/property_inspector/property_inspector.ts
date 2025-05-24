import * as vscode from "vscode";
import { globals } from "../../extension";
import type { GodotNativeSymbol, NativeSymbolInspectParams } from "../../providers/documentation_types";
import { convert_resource_path_to_uri, createLogger } from "../../utils";
import type { Scene, SceneNode } from "../types";
import type { PropertyData } from "./types";
import { NodePropertiesWebviewProvider } from "./webview_provider";

const log = createLogger("scenes.property_inspector");

export class PropertyInspector {
	private classInfoCache = new Map<string, GodotNativeSymbol>();

	constructor(
		private nodePropertiesProvider: NodePropertiesWebviewProvider
	) {}

	public async inspectNodeProperties(item: SceneNode, scene: Scene): Promise<void> {
		// Validate inputs
		if (!item || !scene) {
			log.warn("Cannot inspect properties: invalid node or scene");
			this.nodePropertiesProvider.clearProperties();
			return;
		}

		// Get the class information from Godot's LSP
		if (!globals.lsp?.client) {
			this.nodePropertiesProvider.clearProperties();
			return;
		}

		// Check if the LSP client is in a rejected state
		if ((globals.lsp.client as any).rejected) {
			this.nodePropertiesProvider.clearProperties();
			return;
		}

		try {
			// Group properties by class
			const propertiesByClass = new Map<string, PropertyData[]>();

			// Parse current property values from the node's body using the new SceneNode method
			const currentValues = item.getPropertyValues();

			// Step 1: Get properties from attached script first (if any)
			if (item.hasScript && item.scriptId) {
				const scriptProperties: PropertyData[] = [];
				await this.getScriptProperties(item, scene, scriptProperties);
				
				// Add current values to script properties
				for (const prop of scriptProperties) {
					if (currentValues.has(prop.property.name)) {
						prop.currentValue = currentValues.get(prop.property.name);
					}
				}
				
				if (scriptProperties.length > 0) {
					propertiesByClass.set("Script", scriptProperties);
				}
			}

			// Step 2: Get properties from the full inheritance chain
			await this.getInheritanceChainProperties(item.className, propertiesByClass, currentValues);

			// Update the properties view with node and scene references
			this.nodePropertiesProvider.setNodeProperties(item.label, item, scene, propertiesByClass);

		} catch (error) {
			log.error(`Failed to get properties for ${item.className}: ${error}`);
			this.nodePropertiesProvider.clearProperties();
		}
	}

	private async getInheritanceChainProperties(
		className: string, 
		propertiesByClass: Map<string, PropertyData[]>,
		currentValues: Map<string, string>
	) {
		const visited = new Set<string>();
		let currentClass = className;

		// Walk the inheritance chain
		while (currentClass && !visited.has(currentClass)) {
			visited.add(currentClass);

			// Check cache first
			let classInfo = this.classInfoCache.get(currentClass);
			
			if (!classInfo) {
				try {
					const params: NativeSymbolInspectParams = {
						native_class: currentClass,
						symbol_name: currentClass,
					};

					const response = await globals.lsp.client.send_request("textDocument/nativeSymbol", params);
					if (response) {
						classInfo = response as GodotNativeSymbol;
						
						// Enhance with class info from documentation provider if available
						if (globals.docsProvider?.classInfo?.has(currentClass)) {
							classInfo.class_info = globals.docsProvider.classInfo.get(currentClass);
						}
						
						this.classInfoCache.set(currentClass, classInfo);
					}
				} catch (error) {
					log.warn(`Failed to get properties for class ${currentClass}: ${error}`);
					break;
				}
			}

			if (classInfo?.children) {
				// Extract properties and variables from this class, explicitly excluding functions/methods
				const properties = classInfo.children.filter(child => {
					// Include only Property, Variable, and Field kinds
					const isValidKind = child.kind === vscode.SymbolKind.Property || 
										child.kind === vscode.SymbolKind.Variable ||
										child.kind === vscode.SymbolKind.Field;
					
					// Explicitly exclude functions and methods
					const isNotFunction = child.kind !== vscode.SymbolKind.Method &&
										  child.kind !== vscode.SymbolKind.Function;
					
					// More robust function detection - exclude anything with () unless it's a clear property type annotation
					const detailIsNotFunction = (() => {
						if (!child.detail) return true;
						
						// If it has parentheses, it's likely a function unless it's clearly a property type annotation
						if (child.detail.includes('(')) {
							// Property type annotations look like "property_name: Type = value" 
							// Functions look like "method_name() -> ReturnType" or "method_name(param: Type) -> ReturnType"
							const hasArrow = child.detail.includes('->');
							const hasColon = child.detail.includes(':');
							const hasEquals = child.detail.includes('=');
							
							// If it has () and ->, it's definitely a function
							if (hasArrow) return false;
							
							// If it has () but also has : and =, it might be a property with complex type (unlikely but possible)
							// For safety, if it has (), exclude it unless it clearly matches property pattern
							if (hasColon && hasEquals && !hasArrow) {
								// This might be a property like "complex_prop: Callable = some_func()" 
								// Let's be conservative and still exclude it for now
								return false;
							}
							
							// If it has () without clear property indicators, exclude it
							return false;
						}
						
						return true;
					})();
					
					return isValidKind && isNotFunction && detailIsNotFunction;
				}) as GodotNativeSymbol[];

				// Add properties with appropriate source classification
				if (properties.length > 0) {
					const classProperties: PropertyData[] = [];
					
					for (const prop of properties) {
						const enhancedProp = { ...prop };
						const isInherited = currentClass !== className;
						
						if (isInherited) {
							// Mark inherited properties
							enhancedProp.documentation = `[Inherited from ${currentClass}] ${enhancedProp.documentation || ''}`;
						}
						
						const propertyData: PropertyData = { 
							property: enhancedProp, 
							source: isInherited ? 'inherited' : 'direct'
						};
						
						// Add current value if available
						if (currentValues.has(prop.name)) {
							propertyData.currentValue = currentValues.get(prop.name);
						}
						
						classProperties.push(propertyData);
					}

					propertiesByClass.set(currentClass, classProperties);
				}
			}

			// Move to parent class - use documentation provider's inheritance info as primary source
			let parentClass: string | undefined;
			
			// First try to get inheritance from documentation provider (more reliable)
			if (globals.docsProvider?.classInfo?.has(currentClass)) {
				parentClass = globals.docsProvider.classInfo.get(currentClass)?.inherits;
			}
			
			// Fallback to LSP response inheritance info
			if (!parentClass && classInfo?.class_info?.inherits) {
				parentClass = classInfo.class_info.inherits;
			}
			
			log.info(`Class ${currentClass} inherits from: ${parentClass || '(none)'}`);
			
			// If we still don't have a parent class, log some debug info
			if (!parentClass) {
				log.info(`No parent found for ${currentClass}. Documentation provider available: ${!!globals.docsProvider}`);
				if (globals.docsProvider?.classInfo?.has(currentClass)) {
					const classInfo = globals.docsProvider.classInfo.get(currentClass);
					log.info(`Class info from docs provider:`, JSON.stringify(classInfo, null, 2));
				}
			}
			
			currentClass = parentClass;
		}
		
		log.info(`Inheritance chain processing complete. Visited classes: ${Array.from(visited).join(' → ')}`);
	}

	private async getScriptProperties(item: SceneNode, scene: Scene, allProperties: PropertyData[]) {
		if (!item.scriptId) {
			log.warn(`Cannot get script properties: node ${item.label} has no script ID`);
			return;
		}

		try {
			const scriptResource = scene.externalResources.get(item.scriptId);
			if (!scriptResource) {
				log.warn(`Cannot get script properties: script resource with ID ${item.scriptId} not found`);
				return;
			}

			const scriptUri = await convert_resource_path_to_uri(scriptResource.path);
			if (!scriptUri) {
				log.warn(`Cannot get script properties: failed to convert resource path ${scriptResource.path} to URI`);
				return;
			}

			// Request script symbols using textDocument/documentSymbol
			const symbolsRequest = await globals.lsp.client.send_request("textDocument/documentSymbol", {
				textDocument: { uri: scriptUri.toString() },
			}) as unknown[];

			if (!symbolsRequest || symbolsRequest.length === 0) {
				log.debug(`No symbols found in script ${scriptResource.path}`);
				return;
			}

			// Handle different response formats (Godot 3 vs 4)
			const symbols = (typeof symbolsRequest[0] === "object" && "children" in symbolsRequest[0])
				? (symbolsRequest[0].children as unknown[]) // Godot 4.0+ returns an array of children
				: symbolsRequest; // Godot 3.2 and below returns an array of symbols

			// Filter for properties and variables (including @exported ones)
			for (const symbol of symbols) {
				const sym = symbol as any;
				
				// Check if this is a variable/property and not a function
				const isValidKind = sym.kind === vscode.SymbolKind.Variable || 
									sym.kind === vscode.SymbolKind.Property ||
									sym.kind === vscode.SymbolKind.Field;
				
				const isNotFunction = sym.kind !== vscode.SymbolKind.Method &&
									  sym.kind !== vscode.SymbolKind.Function;
				
				// More robust function detection - same logic as inheritance chain
				const detailIsNotFunction = (() => {
					if (!sym.detail) return true;
					
					// If it has parentheses, it's likely a function unless it's clearly a property type annotation
					if (sym.detail.includes('(')) {
						// Property type annotations look like "property_name: Type = value" 
						// Functions look like "method_name() -> ReturnType" or "method_name(param: Type) -> ReturnType"
						const hasArrow = sym.detail.includes('->');
						const hasColon = sym.detail.includes(':');
						const hasEquals = sym.detail.includes('=');
						
						// If it has () and ->, it's definitely a function
						if (hasArrow) return false;
						
						// If it has () but also has : and =, it might be a property with complex type (unlikely but possible)
						// For safety, if it has (), exclude it unless it clearly matches property pattern
						if (hasColon && hasEquals && !hasArrow) {
							// This might be a property like "complex_prop: Callable = some_func()" 
							// Let's be conservative and still exclude it for now
							return false;
						}
						
						// If it has () without clear property indicators, exclude it
						return false;
					}
					
					return true;
				})();
				
				if (isValidKind && isNotFunction && detailIsNotFunction) {
					// Create a GodotNativeSymbol from the script symbol
					const scriptProperty: GodotNativeSymbol = {
						name: sym.name,
						detail: sym.detail || `${sym.name}: (script variable)`,
						kind: sym.kind,
						range: sym.range,
						selectionRange: sym.selectionRange,
						documentation: `[Script property] ${sym.documentation || 'Variable defined in attached script'}`,
						native_class: item.className,
						children: sym.children
					};
					
					allProperties.push({ 
						property: scriptProperty, 
						source: 'script' 
					});
				}
			}
		} catch (error) {
			log.warn(`Failed to get script properties for ${item.label}: ${error}`);
		}
	}

	public clearCache(): void {
		this.classInfoCache.clear();
	}
} 
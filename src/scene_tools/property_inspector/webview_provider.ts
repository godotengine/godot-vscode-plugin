import * as vscode from "vscode";
import { createLogger, make_docs_uri } from "../../utils";
import type { Scene, SceneNode } from "../types";
import { SceneFileOperations } from "./scene_file_operations";
import type { PropertyData } from "./types";
import { extractPropertyValue } from "./utils";
import { WebviewHtmlGenerator } from "./webview_html_generator";

const log = createLogger("scenes.property_inspector.webview_provider");

export class NodePropertiesWebviewProvider implements vscode.WebviewViewProvider {
	private webviewView?: vscode.WebviewView;
	private currentNodeName = "";
	private currentNode?: SceneNode;
	private currentScene?: Scene;
	private propertiesByClass = new Map<string, PropertyData[]>();

	constructor(private extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			(message: any) => {
				if (message.type === 'propertyChange') {
					this.handlePropertyChange(message.propertyName, message.newValue, message.propertyType);
				} else if (message.type === 'propertyReset') {
					this.handlePropertyReset(message.propertyName);
				} else if (message.type === 'openDocumentation') {
					// Open documentation for the specified class
					const uri = make_docs_uri(message.className);
					vscode.commands.executeCommand("vscode.open", uri);
				}
			}
		);

		this.updateContent();
	}

	public setNodeProperties(
		nodeName: string, 
		node: SceneNode, 
		scene: Scene, 
		propertiesByClass: Map<string, PropertyData[]>
	) {
		this.currentNodeName = nodeName;
		this.currentNode = node;
		this.currentScene = scene;
		this.propertiesByClass = propertiesByClass;
		this.updateContent();
	}

	public clearProperties() {
		this.currentNodeName = "";
		this.currentNode = undefined;
		this.currentScene = undefined;
		this.propertiesByClass.clear();
		this.updateContent();
	}

	public getCurrentNodeName(): string {
		return this.currentNodeName;
	}

	private async handlePropertyChange(propertyName: string, newValue: string, propertyType: string) {
		if (!this.currentNode || !this.currentScene) {
			log.warn("Cannot change property: no current node or scene");
			return;
		}

		log.info(`Handling property change: ${propertyName} = ${newValue} (type: ${propertyType})`);

		try {
			// Get default value for this property
			let defaultValue = '';
			for (const [className, properties] of this.propertiesByClass) {
				const property = properties.find(p => p.property.name === propertyName);
				if (property) {
					defaultValue = extractPropertyValue(property.property);
					break;
				}
			}

			await SceneFileOperations.updatePropertyInSceneFile(
				this.currentScene,
				this.currentNode,
				propertyName,
				newValue,
				propertyType,
				defaultValue
			);
			
			// Update the current value in our data structure
			let propertyFound = false;
			for (const [className, properties] of this.propertiesByClass) {
				const property = properties.find(p => p.property.name === propertyName);
				if (property) {
					log.info(`Updating property ${propertyName} in class ${className} from ${property.currentValue} to ${newValue}`);
					property.currentValue = newValue;
					propertyFound = true;
					break;
				}
			}
			
			if (!propertyFound) {
				log.warn(`Property ${propertyName} not found in properties data structure`);
			}
			
			// Re-parse current values from the updated node body to ensure consistency
			const currentValues = SceneFileOperations.parseNodePropertyValues(this.currentNode);
			log.info(`Re-parsed node property values:`, Object.fromEntries(currentValues));
			
			// Update all properties with current values from node body
			for (const [className, properties] of this.propertiesByClass) {
				for (const propertyData of properties) {
					if (currentValues.has(propertyData.property.name)) {
						const valueFromNode = currentValues.get(propertyData.property.name);
						if (propertyData.currentValue !== valueFromNode) {
							log.info(`Syncing property ${propertyData.property.name}: data=${propertyData.currentValue}, node=${valueFromNode}`);
							propertyData.currentValue = valueFromNode;
						}
					}
				}
			}
			
			log.info(`Property change handled successfully`);
			
		} catch (error) {
			log.error(`Failed to update property ${propertyName}: ${error}`);
			vscode.window.showErrorMessage(`Failed to update property: ${error.message}`);
		}
	}

	private async handlePropertyReset(propertyName: string) {
		if (!this.currentNode || !this.currentScene) {
			log.warn("Cannot reset property: no current node or scene");
			return;
		}

		try {
			// Find the property to get its default value
			let defaultValue = '';
			let propertyType = '';
			
			for (const [className, properties] of this.propertiesByClass) {
				const property = properties.find(p => p.property.name === propertyName);
				if (property) {
					defaultValue = extractPropertyValue(property.property);
					propertyType = property.property.detail?.split(':')[1]?.split('=')[0]?.trim() || 'unknown';
					break;
				}
			}

			// Remove the property from scene file (since default values don't need to be stored)
			await SceneFileOperations.removePropertyFromSceneFile(
				this.currentScene,
				this.currentNode,
				propertyName
			);
			
			// Update the current value in our data structure
			for (const [className, properties] of this.propertiesByClass) {
				const property = properties.find(p => p.property.name === propertyName);
				if (property) {
					property.currentValue = defaultValue;
					break;
				}
			}

			// Regenerate the HTML to update reset button visibility
			this.updateContent();
			
		} catch (error) {
			log.error(`Failed to reset property ${propertyName}: ${error}`);
			vscode.window.showErrorMessage(`Failed to reset property: ${error.message}`);
		}
	}

	private updateContent() {
		if (!this.webviewView) {
			return;
		}

		if (this.propertiesByClass.size === 0) {
			this.webviewView.webview.html = WebviewHtmlGenerator.generateEmptyHtml();
			return;
		}

		this.webviewView.webview.html = WebviewHtmlGenerator.generatePropertiesHtml(
			this.currentNodeName,
			this.propertiesByClass
		);
	}
} 
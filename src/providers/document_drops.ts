import * as path from "node:path";
import * as vscode from "vscode";
import {
	CancellationToken,
	DataTransfer,
	DocumentDropEdit,
	DocumentDropEditProvider,
	ExtensionContext,
	languages,
	Position,
	ProviderResult,
	Range,
	TextDocument,
	Uri,
} from "vscode";
import { SceneParser } from "../scene_tools/parser";
import { createLogger, node_name_to_snake, node_name_to_pascal, node_name_to_camel, get_project_version, convert_uri_to_resource_path } from "../utils";
import { SceneNode } from "../scene_tools/types";

const log = createLogger("providers.drops");

interface CSharpStyleOption {
	label: string;
	description: string;
	generator: (className: string, propertyName: string, fieldName: string, nodePath: string) => string | vscode.SnippetString;
}

const CSHARP_STYLE_OPTIONS: Record<string, CSharpStyleOption> = {
	exportPrivate: {
		label: "[Export] private property",
		description: "Private auto-property with underscore prefix",
		generator: (className, _propertyName, fieldName) => {
			const snippet = new vscode.SnippetString();
			snippet.appendText(`[Export] private ${className} _`);
			snippet.appendPlaceholder(fieldName);
			snippet.appendText(" { get; set; }");
			return snippet;
		},
	},
	exportPublic: {
		label: "[Export] public property",
		description: "Public auto-property",
		generator: (className, propertyName) => {
			const snippet = new vscode.SnippetString();
			snippet.appendText(`[Export] public ${className} `);
			snippet.appendPlaceholder(propertyName);
			snippet.appendText(" { get; set; }");
			return snippet;
		},
	},
	lazyField: {
		label: "Lazy field (C# 14)",
		description: "Cached with field keyword",
		generator: (className, _propertyName, fieldName, nodePath) =>
			`${className} _${fieldName} => field ??= GetNode<${className}>("${nodePath}");`,
	},
	expressionBodied: {
		label: "Expression-bodied property",
		description: "Simple getter, no caching",
		generator: (className, propertyName, _fieldName, nodePath) =>
			`${className} ${propertyName} => GetNode<${className}>("${nodePath}");`,
	},
};

/** Default style key */
const DEFAULT_CSHARP_STYLE = "exportPublic";

export class GDDocumentDropEditProvider implements DocumentDropEditProvider {
	public parser = new SceneParser();

	constructor(private context: ExtensionContext) {
		const dropEditSelector = [
			{ language: "csharp", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(languages.registerDocumentDropEditProvider(dropEditSelector, this));
	}

	public async provideDocumentDropEdits(
		document: TextDocument,
		position: Position,
		dataTransfer: DataTransfer,
		token: CancellationToken,
	): Promise<DocumentDropEdit> {
		// log.debug("provideDocumentDropEdits", document, dataTransfer);

		// Try to get data from the WebView-based Scene Preview first
		const webviewData = dataTransfer.get("application/vnd.code.tree.godotTools.scenePreview");
		if (webviewData) {
			return this.handleWebviewDrop(document, position, webviewData);
		}

		// Fall back to native TreeView drag data (godot/* MIME types)
		const targetResPath = await convert_uri_to_resource_path(document.uri);

		const sceneItem = dataTransfer.get("godot/scene");
		if (!sceneItem?.value) {
			return undefined;
		}
		const originFsPath = sceneItem.value;
		const originUri = vscode.Uri.file(originFsPath);

		const originDocument = await vscode.workspace.openTextDocument(originUri);
		const scene = await this.parser.parse_scene(originDocument);

		let scriptId = "";
		for (const res of scene.externalResources.values()) {
			if (res.path === targetResPath) {
				scriptId = res.id;
				break;
			}
		}

		let nodePathOfTarget: SceneNode;
		if (scriptId) {
			const find_node = () => {
				if (scene.root.scriptId === scriptId) {
					return scene.root;
				}
				for (const node of scene.nodes.values()) {
					if (node.scriptId === scriptId) {
						return node;
					}
				}
			};
			nodePathOfTarget = find_node();
		}

		const className: string = dataTransfer.get("godot/class")?.value;
		if (className) {
			const nodePath: string = dataTransfer.get("godot/path")?.value;
			let relativePath: string = dataTransfer.get("godot/relativePath")?.value;
			const unique = dataTransfer.get("godot/unique")?.value === "true";
			const label: string = dataTransfer.get("godot/label")?.value;

			if (nodePathOfTarget) {
				const targetPath = path.normalize(path.relative(nodePathOfTarget?.path, nodePath));
				relativePath = targetPath.split(path.sep).join(path.posix.sep);
			}

			// For the root node, the path is empty and needs to be replaced with the node name
			let savePath = relativePath || label;

			if (document.languageId === "gdscript") {
				if (savePath.startsWith(".")) {
					savePath = `'${savePath}'`;
				}
				let qualifiedPath = `$${savePath}`;

				if (unique) {
					// For unique nodes, we can use the % syntax and drop the full path
					qualifiedPath = `%${label}`;
				}

				const line = document.lineAt(position.line);
				if (line.text === "") {
					// We assume that if the user is dropping a node in an empty line, they are at the top of
					// the script and want to declare an onready variable

					const snippet = new vscode.SnippetString();

					if ((await get_project_version())?.startsWith("4")) {
						snippet.appendText("@");
					}
					snippet.appendText("onready var ");
					snippet.appendPlaceholder(node_name_to_snake(label));
					snippet.appendText(`: ${className} = ${qualifiedPath}`);
					return new vscode.DocumentDropEdit(snippet);
				}

				// In any other place, we assume the user wants to get a reference to the node itself
				return new vscode.DocumentDropEdit(qualifiedPath);
			}

			if (document.languageId === "csharp") {
				const propertyName = node_name_to_pascal(label);
				const fieldName = node_name_to_camel(label);
				const nodePath = unique ? `%${label}` : savePath;

				const line = document.lineAt(position.line);
				if (line.text.trim() === "") {
					// Empty line: use configured style for property declaration
					const config = vscode.workspace.getConfiguration("godotTools.csharp");
					const styleKey = config.get<string>("nodeReferenceStyle", DEFAULT_CSHARP_STYLE);
					const style = CSHARP_STYLE_OPTIONS[styleKey] || CSHARP_STYLE_OPTIONS[DEFAULT_CSHARP_STYLE];
					const code = style.generator(className, propertyName, fieldName, nodePath);
					return new vscode.DocumentDropEdit(code);
				}

				// Non-empty line: inline GetNode call
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${nodePath}")`);
			}
		}
	}

	/**
	 * Handle drops from the WebView-based Scene Preview.
	 * The WebView sends JSON data with node information.
	 */
	private async handleWebviewDrop(
		document: TextDocument,
		position: Position,
		webviewDataItem: vscode.DataTransferItem,
	): Promise<DocumentDropEdit> {
		try {
			const rawData = await webviewDataItem.asString();
			const nodeData = JSON.parse(rawData);

			const className: string = nodeData.type;
			const label: string = nodeData.name;
			let relativePath: string = nodeData.relativePath;
			const unique: boolean = nodeData.unique === true || nodeData.unique === "true";
			const scenePath: string = nodeData.scenePath;
			const useSecondaryStyle: boolean = nodeData.useSecondaryStyle === true;

			if (!className || !label) {
				log.debug("WebView drop missing required data:", nodeData);
				return undefined;
			}

			// Load the scene to find the target node (the script that's being dropped onto)
			const targetResPath = await convert_uri_to_resource_path(document.uri);
			const originUri = vscode.Uri.file(scenePath);
			const originDocument = await vscode.workspace.openTextDocument(originUri);
			const scene = await this.parser.parse_scene(originDocument);

			// Find the script ID for the target document
			let scriptId = "";
			for (const res of scene.externalResources.values()) {
				if (res.path === targetResPath) {
					scriptId = res.id;
					break;
				}
			}

			// Find the node that has this script attached
			let nodePathOfTarget: SceneNode;
			if (scriptId) {
				if (scene.root?.scriptId === scriptId) {
					nodePathOfTarget = scene.root;
				} else {
					for (const node of scene.nodes.values()) {
						if (node.scriptId === scriptId) {
							nodePathOfTarget = node;
							break;
						}
					}
				}
			}

			// If we found the target node, compute relative path from target to dragged node
			if (nodePathOfTarget) {
				const targetPath = path.normalize(path.relative(nodePathOfTarget.path, nodeData.path));
				relativePath = targetPath.split(path.sep).join(path.posix.sep);
			}

			// For the root node, the path is empty and needs to be replaced with the node name
			let savePath = relativePath || label;

			if (document.languageId === "gdscript") {
				if (savePath.startsWith(".")) {
					savePath = `'${savePath}'`;
				}
				let qualifiedPath = `$${savePath}`;

				if (unique) {
					qualifiedPath = `%${label}`;
				}

				const line = document.lineAt(position.line);
				if (line.text === "") {
					const snippet = new vscode.SnippetString();
					if ((await get_project_version())?.startsWith("4")) {
						snippet.appendText("@");
					}
					snippet.appendText("onready var ");
					snippet.appendPlaceholder(node_name_to_snake(label));
					snippet.appendText(`: ${className} = ${qualifiedPath}`);
					return new vscode.DocumentDropEdit(snippet);
				}

				return new vscode.DocumentDropEdit(qualifiedPath);
			}

			if (document.languageId === "csharp") {
				const propertyName = node_name_to_pascal(label);
				const fieldName = node_name_to_camel(label);
				const nodePath = unique ? `%${label}` : savePath;

				const line = document.lineAt(position.line);
				if (line.text.trim() === "") {
					const config = vscode.workspace.getConfiguration("godotTools.csharp");
					// Use secondary style if Ctrl+Shift was held during drag start
					const styleKey = useSecondaryStyle
						? config.get<string>("secondaryNodeReferenceStyle", "lazyField")
						: config.get<string>("nodeReferenceStyle", DEFAULT_CSHARP_STYLE);
					const style = CSHARP_STYLE_OPTIONS[styleKey] || CSHARP_STYLE_OPTIONS[DEFAULT_CSHARP_STYLE];
					const code = style.generator(className, propertyName, fieldName, nodePath);
					return new vscode.DocumentDropEdit(code);
				}

				return new vscode.DocumentDropEdit(`GetNode<${className}>("${nodePath}")`);
			}
		} catch (error) {
			log.error("Error handling WebView drop:", error);
		}

		return undefined;
	}
}

import * as fs from "node:fs";
import * as vscode from "vscode";
import {
	convert_resource_path_to_uri,
	createLogger,
	find_file,
	get_configuration,
	make_docs_uri,
	register_command,
	set_context,
	get_extension_uri,
} from "../utils";
import { SceneParser } from "./parser";
import { searchNodes } from "./search";
import { SceneNode, type Scene } from "./types";

const log = createLogger("scenes.preview.webview", { output: "Godot Scene Parser" });

/**
 * Serialized node data sent to the WebView
 */
interface SerializedNode {
	id: string;
	label: string;
	className: string;
	path: string;
	relativePath: string;
	resourcePath: string;
	unique: boolean;
	hasScript: boolean;
	scriptId: string;
	hasChildren: boolean;
	children: SerializedNode[];
	fromInstance: boolean;
	isInstanced: boolean;
}

/**
 * WebView-based Scene Preview provider with integrated search functionality.
 * Replaces the native TreeDataProvider with a rich WebView UI.
 */
export class ScenePreviewWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "godotTools.scenePreview";

	private view?: vscode.WebviewView;
	private viewReady = false;
	private scenePreviewLocked = false;
	private currentScene = "";
	public parser = new SceneParser();
	public scene: Scene;
	private watcher = vscode.workspace.createFileSystemWatcher("**/*.tscn");

	constructor(private context: vscode.ExtensionContext) {
		context.subscriptions.push(
			register_command("scenePreview.lock", this.lock_preview.bind(this)),
			register_command("scenePreview.unlock", this.unlock_preview.bind(this)),
			register_command("scenePreview.copyNodePath", this.copy_node_path.bind(this)),
			register_command("scenePreview.copyResourcePath", this.copy_resource_path.bind(this)),
			register_command("scenePreview.openScene", this.open_scene.bind(this)),
			register_command("scenePreview.openScript", this.open_script.bind(this)),
			register_command("scenePreview.openCurrentScene", this.open_current_scene.bind(this)),
			register_command("scenePreview.openMainScript", this.open_main_script.bind(this)),
			register_command("scenePreview.goToDefinition", this.go_to_definition.bind(this)),
			register_command("scenePreview.openDocumentation", this.open_documentation.bind(this)),
			register_command("scenePreview.refresh", this.refresh.bind(this)),
			vscode.window.onDidChangeActiveTextEditor(this.text_editor_changed.bind(this)),
			this.watcher.onDidChange(this.on_file_changed.bind(this)),
			this.watcher,
		);

		// Restore locked scene from workspace state
		const lockedScene: string | undefined = this.context.workspaceState.get(
			"godotTools.scenePreview.lockedScene"
		);
		if (lockedScene && fs.existsSync(lockedScene)) {
			set_context("scenePreview.locked", true);
			this.scenePreviewLocked = true;
			this.currentScene = lockedScene;
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		webviewView.webview.html = this.getHtmlContent(webviewView.webview);

		// Handle messages from the WebView
		webviewView.webview.onDidReceiveMessage((message) => {
			this.handleMessage(message);
		});

		// Mark view as ready after a short delay to ensure DOM is loaded
		setTimeout(() => {
			this.viewReady = true;
			this.refresh();
		}, 100);
	}

	private handleMessage(message: any): void {
		switch (message.type) {
			case "ready":
				this.viewReady = true;
				this.refresh();
				break;
			case "search":
				this.handleSearch(message.query);
				break;
			case "nodeClick":
				this.handleNodeClick(message.node);
				break;
			case "contextMenu":
				this.handleContextMenu(message.node, message.action);
				break;
			case "expandNode":
				// Handled in WebView, no action needed
				break;
		}
	}

	private handleSearch(query: string): void {
		if (!this.scene?.nodes) {
			return;
		}

		if (!query.trim()) {
			// Empty query: send full tree
			this.sendTreeData();
			return;
		}

		// Perform search and send filtered results
		const results = searchNodes(this.scene, query);
		const flatNodes: SerializedNode[] = results.map((r) => ({
			id: r.node.path,
			label: r.node.label as string,
			className: r.node.className,
			path: r.node.path,
			relativePath: r.node.relativePath,
			resourcePath: r.node.resourcePath,
			unique: r.node.unique,
			hasScript: r.node.hasScript,
			scriptId: r.node.scriptId,
			hasChildren: false,
			children: [],
			fromInstance: r.node.contextValue?.includes("fromInstance") ?? false,
			isInstanced: r.node.contextValue?.includes("instanced") ?? false,
		}));

		// Get icon base URIs for the WebView
		const darkIconsUri = this.view.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "resources", "godot_icons", "dark")
		);
		const lightIconsUri = this.view.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "resources", "godot_icons", "light")
		);

		this.postMessage({
			type: "searchResults",
			results: flatNodes,
			query: query,
			darkIconsBaseUri: darkIconsUri.toString(),
			lightIconsBaseUri: lightIconsUri.toString(),
		});
	}

	private handleNodeClick(nodeData: any): void {
		// Could be used for selection state, currently no action needed
		log.debug("Node clicked:", nodeData);
	}

	private handleContextMenu(nodeData: any, action: string): void {
		const node = this.scene?.nodes.get(nodeData.path);
		if (!node) return;

		switch (action) {
			case "copyNodePath":
				this.copy_node_path(node);
				break;
			case "copyResourcePath":
				this.copy_resource_path(node);
				break;
			case "openScene":
				this.open_scene(node);
				break;
			case "openScript":
				this.open_script(node);
				break;
			case "goToDefinition":
				this.go_to_definition(node);
				break;
			case "openDocumentation":
				this.open_documentation(node);
				break;
		}
	}

	private postMessage(message: any): void {
		if (this.view && this.viewReady) {
			this.view.webview.postMessage(message);
		}
	}

	public getCurrentScene(): string {
		return this.currentScene;
	}

	public async on_file_changed(uri: vscode.Uri): Promise<void> {
		if (!uri.fsPath.endsWith(".tscn")) {
			return;
		}
		setTimeout(async () => {
			if (uri.fsPath === this.currentScene) {
				this.refresh();
			} else {
				const document = await vscode.workspace.openTextDocument(uri);
				this.parser.parse_scene(document);
			}
		}, 20);
	}

	public async text_editor_changed(): Promise<void> {
		if (this.scenePreviewLocked) {
			return;
		}
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let fileName = editor.document.uri.fsPath;
			const mode = get_configuration("scenePreview.previewRelatedScenes");

			// Attempt to find related scene
			if (!fileName.endsWith(".tscn")) {
				const searchName = fileName.replace(".gd", ".tscn").replace(".cs", ".tscn");

				if (mode === "anyFolder") {
					const relatedScene = await find_file(searchName);
					if (!relatedScene) {
						return;
					}
					fileName = relatedScene.fsPath;
				}

				if (mode === "sameFolder") {
					if (fs.existsSync(searchName)) {
						fileName = searchName;
					} else {
						return;
					}
				}
				if (mode === "off") {
					return;
				}
			}

			// Don't attempt to parse non-scenes
			if (!fileName.endsWith(".tscn")) {
				return;
			}

			this.currentScene = fileName;
			this.refresh();
		}
	}

	public async refresh(): Promise<void> {
		if (!fs.existsSync(this.currentScene)) {
			this.postMessage({ type: "clear" });
			return;
		}

		const document = await vscode.workspace.openTextDocument(this.currentScene);

		// Use basic parsing first to debug children issue
		this.scene = this.parser.parse_scene(document);
		this.sendTreeData();
	}

	private sendTreeData(): void {
		if (!this.scene?.root) {
			this.postMessage({ type: "clear" });
			return;
		}

		const serializeNode = (node: SceneNode): SerializedNode => ({
			id: node.path,
			label: node.label as string,
			className: node.className,
			path: node.path,
			relativePath: node.relativePath,
			resourcePath: node.resourcePath,
			unique: node.unique,
			hasScript: node.hasScript,
			scriptId: node.scriptId,
			hasChildren: node.children.length > 0,
			children: node.children.map(serializeNode),
			fromInstance: node.contextValue?.includes("fromInstance") ?? false,
			isInstanced: node.contextValue?.includes("instanced") ?? false,
		});

		const treeData = serializeNode(this.scene.root);

		// Get icon base URIs for the WebView
		const darkIconsUri = this.view.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "resources", "godot_icons", "dark")
		);
		const lightIconsUri = this.view.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "resources", "godot_icons", "light")
		);

		this.postMessage({
			type: "updateTree",
			tree: treeData,
			sceneTitle: this.scene.title,
			scenePath: this.currentScene,
			darkIconsBaseUri: darkIconsUri.toString(),
			lightIconsBaseUri: lightIconsUri.toString(),
		});
	}

	private lock_preview(): void {
		this.scenePreviewLocked = true;
		set_context("scenePreview.locked", true);
		this.context.workspaceState.update("godotTools.scenePreview.lockedScene", this.currentScene);
		this.postMessage({ type: "lockStateChanged", locked: true });
	}

	private unlock_preview(): void {
		this.scenePreviewLocked = false;
		set_context("scenePreview.locked", false);
		this.context.workspaceState.update("godotTools.scenePreview.lockedScene", "");
		this.postMessage({ type: "lockStateChanged", locked: false });
		this.refresh();
	}

	private copy_node_path(item: SceneNode): void {
		if (item.unique) {
			vscode.env.clipboard.writeText(`%${item.label}`);
			return;
		}
		vscode.env.clipboard.writeText(item.relativePath);
	}

	private copy_resource_path(item: SceneNode): void {
		vscode.env.clipboard.writeText(item.resourcePath);
	}

	private async open_scene(item: SceneNode): Promise<void> {
		const uri = await convert_resource_path_to_uri(item.resourcePath);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_script(item: SceneNode): Promise<void> {
		const resource = this.scene.externalResources.get(item.scriptId);
		if (!resource) return;

		const uri = await convert_resource_path_to_uri(resource.path);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_current_scene(): Promise<void> {
		if (this.currentScene) {
			const document = await vscode.workspace.openTextDocument(this.currentScene);
			vscode.window.showTextDocument(document);
		}
	}

	private async open_main_script(): Promise<void> {
		if (this.currentScene && this.scene?.root?.hasScript) {
			const resource = this.scene.externalResources.get(this.scene.root.scriptId);
			if (resource) {
				const uri = await convert_resource_path_to_uri(resource.path);
				if (uri) {
					vscode.window.showTextDocument(uri, { preview: true });
				}
			}
		}
	}

	private async go_to_definition(item: SceneNode): Promise<void> {
		const document = await vscode.workspace.openTextDocument(this.currentScene);
		const start = document.positionAt(item.position);
		const end = document.positionAt(item.position + item.text.length);
		const range = new vscode.Range(start, end);
		vscode.window.showTextDocument(document, { selection: range });
	}

	private async open_documentation(item: SceneNode): Promise<void> {
		vscode.commands.executeCommand("vscode.open", make_docs_uri(item.className));
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const nonce = getNonce();
		const stylesUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "media", "scene_preview", "styles.css")
		);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "media", "scene_preview", "main.js")
		);
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
		);

		// Content Security Policy breakdown:
		// - default-src 'none': Block everything by default
		// - style-src: Allow styles from extension and inline styles
		// - script-src: Only allow scripts with our nonce
		// - font-src: Allow fonts (for codicons)
		// - img-src: Allow images from extension resources (for Godot node icons)
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${codiconsUri}" rel="stylesheet">
	<link href="${stylesUri}" rel="stylesheet">
	<title>Scene Preview</title>
</head>
<body>
	<div class="container">
		<div class="search-container">
			<div class="search-input-wrapper">
				<span class="codicon codicon-search search-icon"></span>
				<input
					type="text"
					id="searchInput"
					class="search-input"
					placeholder="Search nodes..."
					autocomplete="off"
					spellcheck="false"
				>
				<button id="clearSearch" class="clear-button" title="Clear (Esc)">
					<span class="codicon codicon-close"></span>
				</button>
			</div>
		</div>
		<div class="scene-title" id="sceneTitle"></div>
		<div class="tree-container" id="treeContainer">
			<div class="welcome-message">Open a Scene to see a preview of its structure</div>
		</div>
	</div>
	<div id="contextMenu" class="context-menu"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

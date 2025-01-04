import * as vscode from "vscode";
import {
	type TreeDataProvider,
	type TreeDragAndDropController,
	type ExtensionContext,
	EventEmitter,
	type Event,
	type TreeView,
	type ProviderResult,
	type TreeItem,
	TreeItemCollapsibleState,
	window,
	languages,
	type Uri,
	type CancellationToken,
	type FileDecoration,
	type DocumentDropEditProvider,
	workspace,
} from "vscode";
import * as fs from "node:fs";
import {
	get_configuration,
	find_file,
	set_context,
	convert_resource_path_to_uri,
	register_command,
	createLogger,
	make_docs_uri,
	node_name_to_snake,
} from "../utils";
import { SceneParser } from "./parser";
import type { SceneNode, Scene } from "./types";

const log = createLogger("scenes.preview");

export class ScenePreviewProvider
	implements TreeDataProvider<SceneNode>, TreeDragAndDropController<SceneNode>, DocumentDropEditProvider
{
	public dropMimeTypes = [];
	public dragMimeTypes = [];
	private tree: TreeView<SceneNode>;
	private scenePreviewLocked = false;
	private currentScene = "";
	public parser = new SceneParser();
	public scene: Scene;
	watcher = workspace.createFileSystemWatcher("**/*.tscn");
	uniqueDecorator = new UniqueDecorationProvider(this);
	scriptDecorator = new ScriptDecorationProvider(this);

	private changeTreeEvent = new EventEmitter<void>();
	public get onDidChangeTreeData(): Event<void> {
		return this.changeTreeEvent.event;
	}

	constructor(private context: ExtensionContext) {
		this.tree = vscode.window.createTreeView("scenePreview", {
			treeDataProvider: this,
			dragAndDropController: this,
		});

		const selector = [
			{ language: "csharp", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			register_command("scenePreview.lock", this.lock_preview.bind(this)),
			register_command("scenePreview.unlock", this.unlock_preview.bind(this)),
			register_command("scenePreview.copyNodePath", this.copy_node_path.bind(this)),
			register_command("scenePreview.copyResourcePath", this.copy_resource_path.bind(this)),
			register_command("scenePreview.openScene", this.open_scene.bind(this)),
			register_command("scenePreview.openScript", this.open_script.bind(this)),
			register_command("scenePreview.openCurrentScene", this.open_current_scene.bind(this)),
			register_command("scenePreview.openCurrentScript", this.open_main_script.bind(this)),
			register_command("scenePreview.goToDefinition", this.go_to_definition.bind(this)),
			register_command("scenePreview.openDocumentation", this.open_documentation.bind(this)),
			register_command("scenePreview.refresh", this.refresh.bind(this)),
			window.onDidChangeActiveTextEditor(this.refresh.bind(this)),
			window.registerFileDecorationProvider(this.uniqueDecorator),
			window.registerFileDecorationProvider(this.scriptDecorator),
			languages.registerDocumentDropEditProvider(selector, this),
			this.watcher.onDidChange(this.on_file_changed.bind(this)),
			this.watcher,
			this.tree.onDidChangeSelection(this.tree_selection_changed),
			this.tree,
		);

		this.refresh();
	}

	public handleDrag(
		source: readonly SceneNode[],
		data: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): void | Thenable<void> {
		data.set("godot/path", new vscode.DataTransferItem(source[0].relativePath));
		data.set("godot/class", new vscode.DataTransferItem(source[0].className));
		data.set("godot/unique", new vscode.DataTransferItem(source[0].unique));
		data.set("godot/label", new vscode.DataTransferItem(source[0].label));
	}

	public provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.DocumentDropEdit> {
		const path: string = dataTransfer.get("godot/path").value;
		const className: string = dataTransfer.get("godot/class").value;
		const line = document.lineAt(position.line);
		const unique = dataTransfer.get("godot/unique").value === "true";
		const label: string = dataTransfer.get("godot/label").value;

		// TODO: compare the source scene to the target file
		// What should happen when you drag a node into a script that isn't the
		// "main" script for that scene?
		// Attempt to calculate a relative path that resolves correctly?

		if (className) {
			// For the root node, the path is empty and needs to be replaced with the node name
			const savePath = path || label;

			if (document.languageId === "gdscript") {
				let qualifiedPath = `$${savePath}`;

				if (unique) {
					// For unique nodes, we can use the % syntax and drop the full path
					qualifiedPath = `%${label}`;
				}

				if (line.text === "") {
					// We assume that if the user is dropping a node in an empty line, they are at the top of
					// the script and want to declare an onready variable
					return new vscode.DocumentDropEdit(
						`@onready var ${node_name_to_snake(label)}: ${className} = ${qualifiedPath}\n`,
					);
				}

				// In any other place, we assume the user wants to get a reference to the node itself
				return new vscode.DocumentDropEdit(qualifiedPath);
			}

			if (document.languageId === "csharp") {
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${savePath}")`);
			}
		}
	}

	public async on_file_changed(uri: vscode.Uri) {
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

	public async refresh() {
		if (this.scenePreviewLocked) {
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let fileName = editor.document.uri.fsPath;
			const mode = get_configuration("scenePreview.previewRelatedScenes");
			// attempt to find related scene
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
			// don't attempt to parse non-scenes
			if (!fileName.endsWith(".tscn")) {
				return;
			}

			const document = await vscode.workspace.openTextDocument(fileName);
			this.scene = this.parser.parse_scene(document);

			this.tree.message = this.scene.title;
			this.currentScene = fileName;

			this.changeTreeEvent.fire();
		}
	}

	private lock_preview() {
		this.scenePreviewLocked = true;
		set_context("scenePreview.locked", true);
	}

	private unlock_preview() {
		this.scenePreviewLocked = false;
		set_context("scenePreview.locked", false);
		this.refresh();
	}

	private copy_node_path(item: SceneNode) {
		if (item.unique) {
			vscode.env.clipboard.writeText(`%${item.label}`);
			return;
		}
		vscode.env.clipboard.writeText(item.relativePath);
	}

	private copy_resource_path(item: SceneNode) {
		vscode.env.clipboard.writeText(item.resourcePath);
	}

	private async open_scene(item: SceneNode) {
		const uri = await convert_resource_path_to_uri(item.resourcePath);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_script(item: SceneNode) {
		const path = this.scene.externalResources[item.scriptId].path;

		const uri = await convert_resource_path_to_uri(path);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_current_scene() {
		if (this.currentScene) {
			const document = await vscode.workspace.openTextDocument(this.currentScene);
			vscode.window.showTextDocument(document);
		}
	}

	private async open_main_script() {
		if (this.currentScene) {
			const root = this.scene.root;
			if (root?.hasScript) {
				const path = this.scene.externalResources[root.scriptId].path;
				const uri = await convert_resource_path_to_uri(path);
				if (uri) {
					vscode.window.showTextDocument(uri, { preview: true });
				}
			}
		}
	}

	private async go_to_definition(item: SceneNode) {
		const document = await vscode.workspace.openTextDocument(this.currentScene);
		const start = document.positionAt(item.position);
		const end = document.positionAt(item.position + item.text.length);
		const range = new vscode.Range(start, end);
		vscode.window.showTextDocument(document, { selection: range });
	}

	private async open_documentation(item: SceneNode) {
		vscode.commands.executeCommand("vscode.open", make_docs_uri(item.className));
	}

	private tree_selection_changed(event: vscode.TreeViewSelectionChangeEvent<SceneNode>) {
		// const item = event.selection[0];
		// log(item.body);
		// const editor = vscode.window.activeTextEditor;
		// const range = editor.document.getText()
		// editor.revealRange(range)
	}

	public getChildren(element?: SceneNode): ProviderResult<SceneNode[]> {
		if (!element) {
			if (!this.scene?.root) {
				return Promise.resolve([]);
			}
			return Promise.resolve([this.scene?.root]);
		}
		return Promise.resolve(element.children);
	}

	public getTreeItem(element: SceneNode): TreeItem | Thenable<TreeItem> {
		if (element.children.length > 0) {
			element.collapsibleState = TreeItemCollapsibleState.Expanded;
		} else {
			element.collapsibleState = TreeItemCollapsibleState.None;
		}

		this.uniqueDecorator.changeDecorationsEvent.fire(element.resourceUri);
		this.scriptDecorator.changeDecorationsEvent.fire(element.resourceUri);

		return element;
	}
}

class UniqueDecorationProvider implements vscode.FileDecorationProvider {
	public changeDecorationsEvent = new EventEmitter<Uri>();
	get onDidChangeFileDecorations(): Event<Uri> {
		return this.changeDecorationsEvent.event;
	}

	constructor(private previewer: ScenePreviewProvider) {}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node?.unique) {
			return {
				badge: "%",
			};
		}
	}
}

class ScriptDecorationProvider implements vscode.FileDecorationProvider {
	public changeDecorationsEvent = new EventEmitter<Uri>();
	get onDidChangeFileDecorations(): Event<Uri> {
		return this.changeDecorationsEvent.event;
	}

	constructor(private previewer: ScenePreviewProvider) {}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node?.hasScript) {
			return {
				badge: "S",
			};
		}
	}
}

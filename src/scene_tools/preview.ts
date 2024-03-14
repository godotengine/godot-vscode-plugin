import * as vscode from "vscode";
import {
	TreeDataProvider,
	TreeDragAndDropController,
	ExtensionContext,
	EventEmitter,
	Event,
	TreeView,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState,
	window,
	languages,
	Uri,
	CancellationToken,
	FileDecoration,
	DocumentDropEditProvider,
	workspace,
} from "vscode";
import * as fs from "fs";
import {
	get_configuration,
	find_file,
	set_context,
	convert_resource_path_to_uri,
	register_command,
	createLogger,
	make_docs_uri,
} from "../utils";
import { SceneParser } from "./parser";
import { SceneNode, Scene } from "./types";

const log = createLogger("scenes.preview");

export class ScenePreviewProvider implements TreeDataProvider<SceneNode>, TreeDragAndDropController<SceneNode>, DocumentDropEditProvider {
	public dropMimeTypes = [];
	public dragMimeTypes = [];
	private tree: TreeView<SceneNode>;
	private scenePreviewPinned = false;
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
			dragAndDropController: this
		});

		const selector = [
			{ language: "csharp", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			register_command("scenePreview.pin", this.pin_preview.bind(this)),
			register_command("scenePreview.unpin", this.unpin_preview.bind(this)),
			register_command("scenePreview.copyNodePath", this.copy_node_path.bind(this)),
			register_command("scenePreview.copyOnReadyVariable", this.copy_on_ready_variable.bind(this)),
			register_command("scenePreview.copyResourcePath", this.copy_resource_path.bind(this)),
			register_command("scenePreview.openScene", this.open_scene.bind(this)),
			register_command("scenePreview.openScript", this.open_script.bind(this)),
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

	public handleDrag(source: readonly SceneNode[], data: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
		data.set("godot/path", new vscode.DataTransferItem(source[0].relativePath));
		data.set("godot/class", new vscode.DataTransferItem(source[0].className));

		var var_name = source[0].label.split(/(?=[A-Z])/).map(function (item) {
			return item.toLowerCase();
		}).join("_");

		data.set("godot/var_name", new vscode.DataTransferItem(var_name));
	}

	public provideDocumentDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentDropEdit> {
		const path = dataTransfer.get("godot/path").value;
		const className = dataTransfer.get("godot/class").value;
		const var_name = dataTransfer.get("godot/var_name").value;

		if (path && className) {
			if (document.languageId === "gdscript") {
				const mode = get_configuration("scenePreview.dragDrop");

				if (mode == "path") {
					return new vscode.DocumentDropEdit(`$${path}`);
				}

				if (mode == "variableDefinition") {
					return new vscode.DocumentDropEdit(`@onready var ${var_name}: ${className} = $${path}`);
				}
			}
			if (document.languageId === "csharp") {
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${path}")`);
			}
		}
	}

	public async on_file_changed(uri: vscode.Uri) {
		if (!uri.fsPath.endsWith(".tscn")) {
			return;
		}
		setTimeout(async () => {
			if (uri.fsPath == this.currentScene) {
				this.refresh();
			} else {
				const document = await vscode.workspace.openTextDocument(uri);
				this.parser.parse_scene(document);
			}
		}, 20);
	}

	public async refresh() {
		if (this.scenePreviewPinned) {
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let fileName = editor.document.uri.fsPath;
			const mode = get_configuration("scenePreview.previewRelatedScenes");
			// attempt to find related scene
			if (!fileName.endsWith(".tscn")) {
				const searchName = fileName.replace(".gd", ".tscn").replace(".cs", ".tscn");

				if (mode == "anyFolder") {
					const relatedScene = await find_file(searchName);
					if (!relatedScene) {
						return;
					}
					fileName = relatedScene.fsPath;
				}

				if (mode == "sameFolder") {
					if (fs.existsSync(searchName)) {
						fileName = searchName;
					} else {
						return;
					}
				}
				if (mode == "off") {
					return;
				}
			}
			// don't attempt to parse non-scenes
			if (!fileName.endsWith(".tscn")) {
				return;
			}

			const document = await vscode.workspace.openTextDocument(fileName);
			this.scene = await this.parser.parse_scene(document);

			this.tree.message = this.scene.title;
			this.currentScene = fileName;

			this.changeTreeEvent.fire();
		}
	}

	private pin_preview() {
		this.scenePreviewPinned = true;
		set_context("scenePreview.pinned", true);
	}

	private unpin_preview() {
		this.scenePreviewPinned = false;
		set_context("scenePreview.pinned", false);
		this.refresh();
	}

	private copy_node_path(item: SceneNode) {
		if (item.unique) {
			vscode.env.clipboard.writeText("%" + item.label);
			return;
		}
		vscode.env.clipboard.writeText(item.relativePath);
	}

	private copy_on_ready_variable(item: SceneNode) {
		var var_name = item.label.split(/(?=[A-Z])/).map(function (item) {
			return item.toLowerCase();
		}).join("_");

		vscode.env.clipboard.writeText(`@onready var ${var_name}: ${item.className} = $${item.relativePath}`);
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
			} else {
				return Promise.resolve([this.scene?.root]);
			}
		} else {
			return Promise.resolve(element.children);
		}
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

	constructor(private previewer: ScenePreviewProvider) { }

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node && node.unique) {
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

	constructor(private previewer: ScenePreviewProvider) { }

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node && node.hasScript) {
			return {
				badge: "S",
			};
		}
	}
}

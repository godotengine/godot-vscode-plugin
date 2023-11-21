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
} from "vscode";
import path = require("path");
import fs = require("fs");
import {
	get_configuration,
	find_file,
	set_context,
	convert_resource_path_to_uri,
	register_command,
	createLogger,
} from "./utils";

const log = createLogger("scene_preview");

export class ScenePreviewProvider implements TreeDataProvider<SceneNode>, TreeDragAndDropController<SceneNode>, DocumentDropEditProvider {
	public dropMimeTypes = [];
	public dragMimeTypes = [];
	private root: SceneNode | undefined;
	private tree: TreeView<SceneNode>;
	private scenePreviewPinned = false;
	private currentScene = "";
	private externalResources = {};
	public nodes: Map<string, SceneNode> = new Map();

	private changeEvent = new EventEmitter<void>();

	constructor(private context: ExtensionContext) {
		this.tree = vscode.window.createTreeView("scenePreview", {
			treeDataProvider: this,
			dragAndDropController: this
		});

		this.tree.onDidChangeSelection(this.tree_selection_changed);

		context.subscriptions.push(
			register_command("scenePreview.pin", this.pin_preview.bind(this)),
			register_command("scenePreview.unpin", this.unpin_preview.bind(this)),
			register_command("scenePreview.copyNodePath", this.copy_node_path.bind(this)),
			register_command("scenePreview.copyResourcePath", this.copy_resource_path.bind(this)),
			register_command("scenePreview.openScene", this.open_scene.bind(this)),
			register_command("scenePreview.openScript", this.open_script.bind(this)),
			register_command("scenePreview.goToDefinition", this.go_to_definition.bind(this)),
			register_command("scenePreview.refresh", this.refresh.bind(this)),
			window.onDidChangeActiveTextEditor(this.refresh.bind(this)),
			window.registerFileDecorationProvider(new ScriptDecorationProvider(this)),
			window.registerFileDecorationProvider(new UniqueDecorationProvider(this)),
			languages.registerDocumentDropEditProvider(["gdscript", "csharp"], this),
			this.tree,
		);

		this.refresh();
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public handleDrag(source: readonly SceneNode[], data: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
		data.set("godot/path", new vscode.DataTransferItem(source[0].relativePath));
		data.set("godot/class", new vscode.DataTransferItem(source[0].className));
	}

	public provideDocumentDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentDropEdit> {
		const path = dataTransfer.get("godot/path").value;
		const className = dataTransfer.get("godot/class").value;

		if (path && className) {
			if (document.languageId === "gdscript") {
				return new vscode.DocumentDropEdit(`$${path}`);
			}
			if (document.languageId === "csharp") {
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${path}")`);
			}
		}
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
			// don't reparse the currently selected scene
			if (this.currentScene == fileName) {
				// TODO: reparse the currentScene if it's changed
				// ideas: store a hash? check last modified time?
				return;
			}
			await this.parse_scene(fileName);
			this.changeEvent.fire();
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
		const id = this.externalResources[item.scriptId].path;

		const uri = await convert_resource_path_to_uri(id);
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

	private tree_selection_changed(event: vscode.TreeViewSelectionChangeEvent<SceneNode>) {
		// const item = event.selection[0];
		// log(item.body);

		// const editor = vscode.window.activeTextEditor;
		// const range = editor.document.getText()
		// editor.revealRange(range)
	}

	public async parse_scene(scene: string) {
		this.currentScene = scene;
		this.tree.message = path.basename(scene);

		const document = await vscode.workspace.openTextDocument(scene);
		const text = document.getText();

		this.externalResources = {};
		this.nodes = new Map();

		for (const match of text.matchAll(/\[ext_resource.*/g)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const path = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/ id="?([\w]+)"?/)?.[1];

			this.externalResources[id] = {
				path: path,
				type: type,
				uid: uid,
				id: id,
			};
		}

		let root = "";
		const nodes = {};
		let lastNode = null;

		const nodeRegex = /\[node name="([\w]*)"(?: type="([\w]*)")?(?: parent="([\w\/.]*)")?(?: instance=ExtResource\(\s*"?([\w]+)"?\s*\))?\]/g;
		for (const match of text.matchAll(nodeRegex)) {
			const name = match[1];
			const type = match[2] ? match[2] : "PackedScene";
			let parent = match[3];
			const instance = match[4] ? match[4] : 0;
			let _path = "";
			let relativePath = "";

			if (parent == undefined) {
				root = name;
				_path = name;
			} else if (parent == ".") {
				parent = root;
				relativePath = name;
				_path = parent + "/" + name;
			} else {
				relativePath = parent + "/" + name;
				parent = root + "/" + parent;
				_path = parent + "/" + name;
			}
			if (lastNode) {
				lastNode.body = text.slice(lastNode.position, match.index);
				lastNode.parse_body();
			}

			const node = new SceneNode(name, type);
			node.path = _path;
			node.description = type;
			node.relativePath = relativePath;
			node.parent = parent;
			node.text = match[0];
			node.position = match.index;
			node.resourceUri = vscode.Uri.from({
				scheme: "godot",
				path: _path,
			});
			this.nodes.set(_path, node);

			if (instance) {
				if (instance in this.externalResources) {
					node.tooltip = this.externalResources[instance].path;
					node.resourcePath = this.externalResources[instance].path;
					if ([".tscn"].includes(path.extname(node.resourcePath))) {
						node.contextValue += "openable";
					}
				}
				node.contextValue += "hasResourcePath";
			}
			if (_path == root) {
				this.root = node;
			}
			if (parent in nodes) {
				nodes[parent].children.push(node);
			}
			nodes[_path] = node;

			lastNode = node;
		}

		lastNode.body = text.slice(lastNode.position, text.length);
		lastNode.parse_body();
	}

	public getChildren(element?: SceneNode): ProviderResult<SceneNode[]> {
		if (!element) {
			if (!this.root) {
				return Promise.resolve([]);
			} else {
				return Promise.resolve([this.root]);
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

		return element;
	}
}

class UniqueDecorationProvider implements vscode.FileDecorationProvider {
	constructor(private previewer: ScenePreviewProvider) { }

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;
		const node = this.previewer.nodes.get(uri.path);
		if (node.unique) {
			return {
				badge: "%",
			};
		}
	}
}

class ScriptDecorationProvider implements vscode.FileDecorationProvider {
	constructor(private previewer: ScenePreviewProvider) { }

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;
		const node = this.previewer.nodes.get(uri.path);
		if (node.hasScript) {
			return {
				badge: "S",
			};
		}
	}
}

export class SceneNode extends TreeItem {
	public path: string;
	public relativePath: string;
	public resourcePath: string;
	public parent: string;
	public text: string;
	public position: number;
	public body: string;
	public unique: boolean = false;
	public hasScript: boolean = false;
	public scriptId: string = "";
	public children: SceneNode[] = [];

	constructor(
		public label: string,
		public className: string,
		public collapsibleState?: TreeItemCollapsibleState
	) {
		super(label, collapsibleState);

		const iconDir = path.join(__filename, "..", "..", "resources", "godot_icons");
		const iconName = className + ".svg";

		this.iconPath = {
			light: path.join(iconDir, "light", iconName),
			dark: path.join(iconDir, "dark", iconName),
		};
	}

	public parse_body() {
		const lines = this.body.split("\n");
		const newLines = [];
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			if (line.startsWith("tile_data")) {
				line = "tile_data = PoolIntArray(...)";
			}
			if (line.startsWith("unique_name_in_owner = true")) {
				this.unique = true;
			}
			if (line.startsWith("script = ExtResource")) {
				this.hasScript = true;
				this.scriptId = line.match(/script = ExtResource\(\s*"?([\w]+)"?\s*\)/)[1];
				this.contextValue += "hasScript";
			}
			if (line != "") {
				newLines.push(line);
			}
		}
		this.body = newLines.join("\n");
		const content = new vscode.MarkdownString();
		content.appendCodeblock(this.body, "gdresource");
		this.tooltip = content;
	}
}

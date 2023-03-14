import {
	TreeDataProvider,
	EventEmitter,
	Event,
	TreeView,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState,
} from "vscode";
import path = require("path");
import fs = require("fs");
import * as vscode from "vscode";
import { get_configuration, set_configuration, find_file, set_context, convert_resource_path_to_uri } from "./utils";
import logger from "./logger";

function log(...messages) {
	logger.log("[scene preview]", messages);
}

export class ScenePreviewProvider implements TreeDataProvider<SceneNode> {
	private root: SceneNode | undefined;
	private tree: TreeView<SceneNode>;
	private scenePreviewPinned = false;
	private currentScene = "";
	private externalResources = {};

	private changeEvent = new EventEmitter<void>();

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
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
				const searchName = fileName.replace(".gd", ".tscn");

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

	constructor() {
		this.tree = vscode.window.createTreeView("scenePreview", {
			treeDataProvider: this,
		});

		this.tree.onDidChangeSelection(this.tree_selection_changed);

		vscode.commands.registerCommand("godotTools.scenePreview.pin", this.pin_preview.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.unpin", this.unpin_preview.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.copyNodePath", this.copy_node_path.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.copyResourcePath", this.copy_resource_path.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.openScene", this.open_scene.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.openScript", this.open_script.bind(this));
		vscode.commands.registerCommand("godotTools.scenePreview.goToDefinition", this.go_to_definition.bind(this));

		vscode.commands.registerCommand("godotTools.scenePreview.refresh", () =>
			this.refresh()
		);

		vscode.window.onDidChangeActiveTextEditor(() => {
			vscode.commands.executeCommand("godotTools.scenePreview.refresh");
		});

		this.refresh();
	}

	private pin_preview() {
		this.scenePreviewPinned = true;
		set_context("godotTools.context.scenePreviewPinned", true);
	}

	private unpin_preview() {
		this.scenePreviewPinned = false;
		set_context("godotTools.context.scenePreviewPinned", false);
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

		const resourceRegex = /\[ext_resource.*/g;
		for (const match of text.matchAll(resourceRegex)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const path = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/id="([\w]+)"/)?.[1];

			this.externalResources[id] = {
				path: path,
				type: type,
				uid: uid,
				id: id,
			};
		}

		let root = "";
		let nodes = {};
		let lastNode = null;

		const nodeRegex = /\[node name="([\w]*)"(?: type="([\w]*)")?(?: parent="([\w\/.]*)")?(?: instance=ExtResource\(\s*"?([\w]+)"?\s*\))?\]/g;
		for (const match of text.matchAll(nodeRegex)) {
			let name = match[1];
			let type = match[2] ? match[2] : "PackedScene";
			let parent = match[3];
			let instance = match[4] ? match[4] : 0;
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

			let node = new SceneNode(name, type);
			node.path = _path;
			node.description = type;
			node.relativePath = relativePath;
			node.parent = parent;
			node.text = match[0];
			node.position = match.index;
			if (instance) {
				if (instance in this.externalResources) {
					node.tooltip = this.externalResources[instance].path;
					node.resourcePath = this.externalResources[instance].path;
					if (['.tscn'].includes(path.extname(node.resourcePath))) {
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
	public scriptId: string = '';
	public children: SceneNode[] = [];

	constructor(
		public label: string,
		public className: string,
		public collapsibleState?: TreeItemCollapsibleState
	) {
		super(label, collapsibleState);

		const iconDir = path.join(__filename, "..", "..", "resources", "godot_icons");
		const iconName = className + '.svg';

		this.iconPath = {
			light: path.join(iconDir, "light", iconName),
			dark: path.join(iconDir, "dark", iconName),
		};
	}

	public parse_body() {
		const lines = this.body.split("\n");
		let newLines = [];
		let tags = [];
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			if (line.startsWith("tile_data")) {
				line = "tile_data = PoolIntArray(...)";
			}
			if (line.startsWith("unique_name_in_owner = true")) {
				tags.push("%");
				this.unique = true;
			}
			if (line.startsWith("script = ExtResource")) {
				tags.push("S");
				this.hasScript = true;
				this.scriptId = line.match(/script = ExtResource\(\s*"?([\w]+)"?\s*\)/)[1];
				this.contextValue += "hasScript";
			}
			if (line != "") {
				newLines.push(line);
			}
		}
		this.body = newLines.join("\n");

		let prefix = "";
		if (tags.length != 0) {
			prefix = tags.join(" ") + " | ";
		}
		this.description = prefix + this.description;
		const content = new vscode.MarkdownString();
		content.appendCodeblock(this.body, "gdresource");
		this.tooltip = content;
	}
}

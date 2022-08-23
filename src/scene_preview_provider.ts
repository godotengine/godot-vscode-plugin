import {
	TreeDataProvider,
	EventEmitter,
	Event,
	TreeView,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState,
} from "vscode";
import * as vscode from "vscode";
import logger from "./logger";
import { SceneNode } from "./debugger/scene_tree/scene_tree_provider";

function log(...messages) {
	logger.log("[scene preview]", messages);
}

export class ScenePreviewProvider implements TreeDataProvider<SceneNode> {
	private root: SceneNode | undefined;
	private tree: TreeView<SceneNode>;

	private changeEvent = new EventEmitter<void>();

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public refresh(): void {
		this.changeEvent.fire();
	}

	constructor() {
		this.tree = vscode.window.createTreeView("scenePreview", {
			treeDataProvider: this,
		});
		this.tree.onDidChangeSelection(this.tree_selection_changed)

		vscode.commands.registerCommand("godotTools.refreshScenePreview", () =>
			this.refresh()
		);

		vscode.window.onDidChangeActiveTextEditor(() => {
			vscode.commands.executeCommand("godotTools.refreshScenePreview");
		});
	}

    private tree_selection_changed(event:vscode.TreeViewSelectionChangeEvent<SceneNode>) {
        // const text = event.selection[0].id
        // log(text)
        
		// const editor = vscode.window.activeTextEditor;
        // const range = editor.document.getText()
        // editor.revealRange(range)
    }

	public parse_current_editor() {
		const editor = vscode.window.activeTextEditor;
		const fileName = editor.document.uri.toString();
		if (!fileName.endsWith(".tscn")) {
			this.root = null;
			return;
		}

		const text = editor.document.getText();
		const result = text.matchAll(
			/\[node name="([\w]*)" type="([\w]*)"(?: parent="([\w\.]*)")?\]/g
		);

		let nodeData = {};
		let root = "";

		for (const match of result) {
			let name = match[1];
			let type = match[2];
			let parent = match[3];
			let path = "";

			if (parent == undefined) {
				root = name;
				path = name;
			} else if (parent == ".") {
				parent = root;
				path = parent + "/" + name;
			} else {
				parent = root + "/" + parent;
				path = parent + "/" + name;
			}

			let node = {
				name: name,
				type: type,
				parent: parent,
				path: path,
				text: match[0],
				children: [],
			};

			if (parent in nodeData) {
				nodeData[parent].children.push(node.path);
			}
			nodeData[path] = node;
		}
		let nodes = {};
		let rootNode: SceneNode;

		for (const path in nodeData) {
			const data = nodeData[path];
			let node = new SceneNode(data.name, data.type, 0, []);
			node.id = data.text;
			if (data.path == root) {
				rootNode = node;
			}
			if (data.parent in nodes) {
				nodes[data.parent].children.push(node);
			}
			nodes[path] = node;
		}
		this.root = rootNode;
	}

	public getChildren(element?: SceneNode): ProviderResult<SceneNode[]> {
		if (!element) {
			this.parse_current_editor();
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
		let has_children = element.children.length > 0;
		let tree_item: TreeItem | undefined;
		tree_item = new TreeItem(
			element.label,
			has_children
				? TreeItemCollapsibleState.Expanded
				: TreeItemCollapsibleState.None
		);

		tree_item.id = element.id;
		tree_item.description = element.class_name;
		tree_item.iconPath = element.iconPath;

		return tree_item;
	}
}

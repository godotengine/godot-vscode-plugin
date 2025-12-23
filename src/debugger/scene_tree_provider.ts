import * as path from "node:path";
import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, Uri, window } from "vscode";
import { get_extension_uri } from "../utils";

const iconDir = get_extension_uri("resources", "godot_icons").fsPath;

export class SceneTreeProvider implements TreeDataProvider<SceneNode> {
	private changeTreeEvent = new EventEmitter<SceneNode>();
	onDidChangeTreeData = this.changeTreeEvent.event;

	private root: SceneNode | undefined;
	public view: TreeView<SceneNode>;

	constructor() {
		this.view = window.createTreeView("godotTools.activeSceneTree", {
			treeDataProvider: this,
		});
	}

	public clear() {
		this.view.description = undefined;
		this.view.message = undefined;

		if (this.root) {
			this.root = undefined;
			this.changeTreeEvent.fire(undefined);
		}
	}

	public setMessage(message: string | undefined) {
		this.view.message = message;
	}

	public setDescription(description: string | undefined) {
		this.view.description = description;
	}

	public fill_tree(node: SceneNode) {
		this.root = node;
		this.changeTreeEvent.fire(undefined);
	}

	public getChildren(element?: SceneNode): SceneNode[] {
		if (!this.root) {
			return [];
		}

		if (!element) {
			return [this.root];
		} else {
			return element.children;
		}
	}

	public getTreeItem(element: SceneNode): TreeItem | Thenable<TreeItem> {
		const has_children = element.children.length > 0;
		const tree_item: TreeItem = new TreeItem(
			element.label,
			has_children
				? element === this.root
					? TreeItemCollapsibleState.Expanded
					: TreeItemCollapsibleState.Collapsed
				: TreeItemCollapsibleState.None,
		);

		tree_item.description = element.class_name;
		tree_item.iconPath = element.iconPath;

		// Auto-inspect on click: when user clicks a node, automatically inspect it
		tree_item.command = {
			command: "godotTools.debugger.inspectNode",
			arguments: [element],
			title: "Inspect Node"
		};

		if (element.scene_file_path) {
			let tooltip = "";
			tooltip += `${element.label}`;
			tooltip += `\n${element.class_name}`;
			tooltip += `\n${element.object_id}`;
			if (element.scene_file_path) {
				tooltip += `\n${element.scene_file_path}`;
			}
			tree_item.tooltip = tooltip;
		}

		return tree_item;
	}
}

export class SceneNode extends TreeItem {
	constructor(
		public label: string,
		public class_name: string,
		public object_id: number,
		public children: SceneNode[],
		public scene_file_path?: string,
		public view_flags?: number,
	) {
		super(label);

		const iconName = `${class_name}.svg`;

		this.iconPath = {
			light: Uri.file(path.join(iconDir, "light", iconName)),
			dark: Uri.file(path.join(iconDir, "dark", iconName)),
		};
	}
}

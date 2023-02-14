import {
	TreeDataProvider,
	EventEmitter,
	Event,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState,
} from "vscode";
import path = require("path");
import fs = require("fs");

export class SceneTreeProvider implements TreeDataProvider<SceneNode> {
	private _on_did_change_tree_data: EventEmitter<
		SceneNode | undefined
	> = new EventEmitter<SceneNode | undefined>();
	private tree: SceneNode | undefined;

	public readonly onDidChangeTreeData: Event<SceneNode> | undefined = this
		._on_did_change_tree_data.event;

	constructor() {}

	public fill_tree(tree: SceneNode) {
		this.tree = tree;
		this._on_did_change_tree_data.fire(undefined);
	}

	public getChildren(element?: SceneNode): ProviderResult<SceneNode[]> {
		if (!this.tree) {
			return Promise.resolve([]);
		}

		if (!element) {
			return Promise.resolve([this.tree]);
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
				? element === this.tree
					? TreeItemCollapsibleState.Expanded
					: TreeItemCollapsibleState.Collapsed
				: TreeItemCollapsibleState.None
		);

		tree_item.description = element.class_name;
		tree_item.iconPath = element.iconPath;

		return tree_item;
	}
}

function match_icon_to_class(class_name: string) {
	let icon_name = `icon${class_name
		.replace(/(2|3)D/, "$1d")
		.replace(/([A-Z0-9])/g, "_$1")
		.toLowerCase()}.svg`;
	return icon_name;
}

export class SceneNode extends TreeItem {
	constructor(
		public label: string,
		public class_name: string,
		public object_id: number,
		public children: SceneNode[],
		public collapsibleState?: TreeItemCollapsibleState
	) {
		super(label, collapsibleState);

		let light = path.join(
			__filename,
			"..",
			"..",
			"..",
			"..",
			"resources",
			"light",
			match_icon_to_class(class_name)
		);
		if (!fs.existsSync(light)) {
			path.join(
				__filename,
				"..",
				"..",
				"..",
				"..",
				"resources",
				"light",
				"node.svg"
			);
		}
		let dark = path.join(
			__filename,
			"..",
			"..",
			"..",
			"..",
			"resources",
			"dark",
			match_icon_to_class(class_name)
		);
		if (!fs.existsSync(light)) {
			path.join(
				__filename,
				"..",
				"..",
				"..",
				"..",
				"resources",
				"dark",
				"node.svg"
			);
		}

		this.iconPath = {
			light: light,
			dark: dark,
		};
	}
}

import {
	TreeItem,
	TreeItemCollapsibleState,
	MarkdownString,
} from "vscode";
import * as path from "path";
import { get_extension_uri } from "../utils";

const iconDir = get_extension_uri("resources", "godot_icons").fsPath;

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
		const content = new MarkdownString();
		content.appendCodeblock(this.body, "gdresource");
		this.tooltip = content;
	}
}

export interface GDResource {
	path: string;
	type: string;
	id: string;
	uid: string;
	body?: string;
	index: number;
	line: number;
}

export class Scene {
	public path: string;
	public title: string;
	public mtime: number;
	public root: SceneNode | undefined;
	public externalResources: {[key: string]: GDResource} = {};
	public subResources: {[key: string]: GDResource} = {};
	public nodes: Map<string, SceneNode> = new Map();
}

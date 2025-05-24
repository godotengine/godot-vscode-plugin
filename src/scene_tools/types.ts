import * as path from "path";
import {
    MarkdownString,
    TreeItem,
    TreeItemCollapsibleState,
    Uri
} from "vscode";
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
	
	// Property cache for efficient access
	private _propertyValues: Map<string, string> | null = null;

	constructor(
		public label: string,
		public className: string,
		public collapsibleState?: TreeItemCollapsibleState
	) {
		super(label, collapsibleState);

		const iconName = className + ".svg";

		this.iconPath = {
			light: Uri.file(path.join(iconDir, "light", iconName)),
			dark: Uri.file(path.join(iconDir, "dark", iconName)),
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
			if (line !== "") {
				newLines.push(line);
			}
		}
		this.body = newLines.join("\n");
		const content = new MarkdownString();
		content.appendCodeblock(this.body, "gdresource");
		this.tooltip = content;
		
		// Clear property cache when body changes
		this._propertyValues = null;
	}

	/**
	 * Parse property values from this node's body
	 */
	public getPropertyValues(): Map<string, string> {
		if (this._propertyValues !== null) {
			return this._propertyValues;
		}

		this._propertyValues = new Map<string, string>();
		
		if (!this.body) {
			return this._propertyValues;
		}

		// Parse each line of the node body to extract property assignments
		const lines = this.body.split('\n');
		for (const line of lines) {
			const trimmedLine = line.trim();
			
			// Look for property assignments (propertyName = value)
			const assignmentMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
			if (assignmentMatch) {
				const propertyName = assignmentMatch[1];
				let propertyValue = assignmentMatch[2].trim();
				
				// Remove quotes from string values and unescape escape sequences
				if (propertyValue.startsWith('"') && propertyValue.endsWith('"')) {
					propertyValue = propertyValue.slice(1, -1);
					// Unescape common escape sequences
					propertyValue = propertyValue
						.replace(/\\n/g, '\n')
						.replace(/\\t/g, '\t')
						.replace(/\\r/g, '\r')
						.replace(/\\"/g, '"')
						.replace(/\\\\/g, '\\');
				}
				
				this._propertyValues.set(propertyName, propertyValue);
			}
		}
		
		return this._propertyValues;
	}

	/**
	 * Get a specific property value from this node
	 */
	public getPropertyValue(propertyName: string): string | undefined {
		return this.getPropertyValues().get(propertyName);
	}

	/**
	 * Clear the property cache (call when the body is updated externally)
	 */
	public clearPropertyCache(): void {
		this._propertyValues = null;
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
	public externalResources: Map<string, GDResource> = new Map();
	public subResources: Map<string, GDResource> = new Map();
	public nodes: Map<string, SceneNode> = new Map();
	
	/**
	 * Get a node by its label/name
	 */
	public getNodeByLabel(label: string): SceneNode | undefined {
		for (const [path, node] of this.nodes) {
			if (node.label === label) {
				return node;
			}
		}
		return undefined;
	}
}

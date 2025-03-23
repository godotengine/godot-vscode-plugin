import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, window } from "vscode";
import { GodotVariable, ObjectId, RawObject } from "./debug_runtime";

export class InspectorProvider implements TreeDataProvider<RemoteProperty> {
	private changeTreeEvent = new EventEmitter<RemoteProperty>();
	onDidChangeTreeData = this.changeTreeEvent.event;

	private root: RemoteProperty | undefined;
	public view: TreeView<RemoteProperty>;

	constructor() {
		this.view = window.createTreeView("godotTools.nodeInspector", {
			treeDataProvider: this,
		});
	}

	public clear() {
		if (this.root) {
			this.root = undefined;
			this.changeTreeEvent.fire(undefined);
		}
	}

	public fill_tree(element_name: string, class_name: string, object_id: number, variable: GodotVariable) {
		this.root = this.parse_variable(variable, object_id);
		this.root.label = element_name;
		this.root.collapsibleState = TreeItemCollapsibleState.Expanded;
		this.root.description = class_name;
		this.changeTreeEvent.fire(undefined);
	}

	public getChildren(element?: RemoteProperty): RemoteProperty[] {
		if (!this.root) {
			return [];
		}

		if (!element) {
			return [this.root];
		} else {
			return element.properties;
		}
	}

	public getTreeItem(element: RemoteProperty): TreeItem | Thenable<TreeItem> {
		return element;
	}

	public get_changed_value(parents: RemoteProperty[], property: RemoteProperty, new_parsed_value: any) {
		const idx = parents.length - 1;
		const value = parents[idx].value;
		if (Array.isArray(value)) {
			const idx = Number.parseInt(property.label);
			if (idx < value.length) {
				value[idx] = new_parsed_value;
			}
		} else if (value instanceof Map) {
			value.set(property.parent.value.key, new_parsed_value);
		} else if (value[property.label]) {
			value[property.label] = new_parsed_value;
		}

		return value;
	}

	public get_top_item(): RemoteProperty {
		if (this.root) {
			return this.root;
		}
		return undefined;
	}

	public has_tree() {
		return this.root !== undefined;
	}

	private parse_variable(va: GodotVariable, object_id?: number): RemoteProperty {
		const value = va.value;
		let rendered_value = "";

		if (typeof value === "number") {
			if (Number.isInteger(value)) {
				rendered_value = `${value}`;
			} else {
				rendered_value = `${Number.parseFloat(value.toFixed(5))}`;
			}
		} else if (typeof value === "bigint" || typeof value === "boolean" || typeof value === "string") {
			rendered_value = `${value}`;
		} else if (typeof value === "undefined") {
			rendered_value = "null";
		} else {
			if (Array.isArray(value)) {
				rendered_value = `Array[${value.length}]`;
			} else if (value instanceof Map) {
				if (value instanceof RawObject) {
					rendered_value = `${value.class_name}`;
				} else {
					rendered_value = `Dictionary[${value.size}]`;
				}
			} else {
				rendered_value = `${value.type_name()}${value.stringify_value()}`;
			}
		}

		let child_props: RemoteProperty[] = [];

		if (value) {
			let sub_variables = [];
			if (typeof value.sub_values === "function" && value instanceof ObjectId === false) {
				sub_variables = value.sub_values();
			} else if (Array.isArray(value)) {
				sub_variables = value.map((va, i) => {
					return { name: `${i}`, value: va };
				});
			} else if (value instanceof Map) {
				sub_variables = Array.from(value.keys()).map((va) => {
					const name = typeof va.rendered_value === "function" ? va.rendered_value() : `${va}`;
					const map_value = value.get(va);
					return { name: name, value: map_value };
				});
			}

			child_props = sub_variables?.map((va) => {
				return this.parse_variable(va, object_id);
			});
		}

		const out_prop = new RemoteProperty(
			va.name,
			value,
			object_id,
			child_props,
			child_props.length === 0 ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Collapsed,
		);
		out_prop.description = rendered_value;
		for (const prop of out_prop.properties) {
			prop.parent = out_prop;
		}
		out_prop.description = rendered_value;

		if (value instanceof ObjectId) {
			out_prop.contextValue = "remote_object";
			out_prop.object_id = Number(value.id);
		} else if (
			typeof value === "number" ||
			typeof value === "bigint" ||
			typeof value === "boolean" ||
			typeof value === "string"
		) {
			out_prop.contextValue = "editable_value";
		} else if (Array.isArray(value) || (value instanceof Map && value instanceof RawObject === false)) {
			for (const prop of out_prop.properties) {
				prop.parent = out_prop;
			}
		}

		return out_prop;
	}
}

export class RemoteProperty extends TreeItem {
	public changes_parent?: boolean;
	public parent?: RemoteProperty;

	constructor(
		public label: string,
		public value: any,
		public object_id: number,
		public properties: RemoteProperty[],
		public collapsibleState?: TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

export class RemoteObject extends RemoteProperty {}

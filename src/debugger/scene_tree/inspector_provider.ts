import {
	TreeDataProvider,
	EventEmitter,
	Event,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState,
} from "vscode";
import { GodotVariable } from "../debug_runtime";
import { RawObject, ObjectId } from "../variables/variants";

export class InspectorProvider implements TreeDataProvider<RemoteProperty> {
	private _on_did_change_tree_data: EventEmitter<
		RemoteProperty | undefined
	> = new EventEmitter<RemoteProperty | undefined>();
	private tree: RemoteProperty | undefined;

	public readonly onDidChangeTreeData: Event<RemoteProperty> | undefined = this
		._on_did_change_tree_data.event;

	constructor() {}

	public clean_up() {
		if (this.tree) {
			this.tree = undefined;
			this._on_did_change_tree_data.fire(undefined);
		}
	}

	public fill_tree(
		element_name: string,
		class_name: string,
		object_id: number,
		variable: GodotVariable
	) {
		this.tree = this.parse_variable(variable, object_id);
		this.tree.label = element_name;
		this.tree.collapsibleState = TreeItemCollapsibleState.Expanded;
		this.tree.description = class_name;
		this._on_did_change_tree_data.fire(undefined);
	}

	public getChildren(
		element?: RemoteProperty
	): ProviderResult<RemoteProperty[]> {
		if (!this.tree) {
			return Promise.resolve([]);
		}

		if (!element) {
			return Promise.resolve([this.tree]);
		} else {
			return Promise.resolve(element.properties);
		}
	}

	public getTreeItem(element: RemoteProperty): TreeItem | Thenable<TreeItem> {
		return element;
	}

	public get_changed_value(
		parents: RemoteProperty[],
		property: RemoteProperty,
		new_parsed_value: any
	) {
		let idx = parents.length - 1;
		let value = parents[idx].value;
		if (Array.isArray(value)) {
			let idx = parseInt(property.label);
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

	public get_top_id(): number {
		if (this.tree) {
			return this.tree.object_id;
		}
		return undefined;
	}

	public get_top_name() {
		if (this.tree) {
			return this.tree.label;
		}
		return undefined;
	}

	public has_tree() {
		return this.tree !== undefined;
	}

	private parse_variable(va: GodotVariable, object_id?: number) {
		let value = va.value;
		let rendered_value = "";

		if (typeof value === "number") {
			if (Number.isInteger(value)) {
				rendered_value = `${value}`;
			} else {
				rendered_value = `${parseFloat(value.toFixed(5))}`;
			}
		} else if (
			typeof value === "bigint" ||
			typeof value === "boolean" ||
			typeof value === "string"
		) {
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
			let sub_variables =
				typeof value["sub_values"] === "function" &&
				value instanceof ObjectId === false
					? value.sub_values()
					: Array.isArray(value)
					? value.map((va, i) => {
							return { name: `${i}`, value: va };
					  })
					: value instanceof Map
					? Array.from(value.keys()).map((va) => {
							let name =
								typeof va["rendered_value"] === "function"
									? va.rendered_value()
									: `${va}`;
							let map_value = value.get(va);

							return { name: name, value: map_value };
					  })
					: [];
			child_props = sub_variables?.map((va) => {
				return this.parse_variable(va, object_id);
			});
		}

		let out_prop = new RemoteProperty(
			va.name,
			value,
			object_id,
			child_props,
			child_props.length === 0
				? TreeItemCollapsibleState.None
				: TreeItemCollapsibleState.Collapsed
		);
		out_prop.description = rendered_value;
		out_prop.properties.forEach((prop) => {
			prop.parent = out_prop;
		});
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
		} else if (
			Array.isArray(value) ||
			(value instanceof Map && value instanceof RawObject === false)
		) {
			out_prop.properties.forEach((prop) => (prop.changes_parent = true));
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
		public collapsibleState?: TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
	}
}

export class RemoteObject extends RemoteProperty {}

import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, window } from "vscode";
import { GodotVariable, ObjectId, RawObject } from "./debug_runtime";
import {
	Vector2, Vector2i, Vector3, Vector3i, Vector4, Vector4i,
	Color, Basis, AABB, Plane, Quat, Rect2, Rect2i,
	Transform2D, Transform3D, Projection, NodePath, StringName
} from "./godot4/variables/variants";

export class InspectorProvider implements TreeDataProvider<RemoteProperty> {
	private changeTreeEvent = new EventEmitter<RemoteProperty>();
	onDidChangeTreeData = this.changeTreeEvent.event;

	private root: RemoteProperty | undefined;
	// Note: TreeView is no longer created here - we now use InspectorWebView (WebView) instead
	// This class is kept for its get_changed_value() logic used in compound value reconstruction
	public view?: TreeView<RemoteProperty>;

	constructor() {
		// Don't create TreeView - the Inspector is now a WebView registered in package.json
		// The old TreeView code conflicted with the WebView registration
	}

	public clear() {
		if (this.view) {
			this.view.description = undefined;
			this.view.message = undefined;
		}

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
			const arrIdx = Number.parseInt(property.label);
			if (arrIdx < value.length) {
				value[arrIdx] = new_parsed_value;
			}
		} else if (value instanceof Map) {
			value.set(property.parent.value.key, new_parsed_value);
		} else if (property.label in value) {
			// Use 'in' operator instead of truthiness check to handle 0 values
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

		// Set parent relationship for all child properties
		for (const prop of out_prop.properties) {
			prop.parent = out_prop;
		}

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
		} else if (this.isCompoundGDObject(value)) {
			// For compound GDObject types (Vector3, Color, Basis, etc.), mark sub-properties as changes_parent
			// This ensures editing x/y/z will properly update the parent Vector3
			// Note: We check for type_name() to distinguish from RawObject which is Map-based
			for (const prop of out_prop.properties) {
				prop.changes_parent = true;
			}
		} else if (Array.isArray(value) || (value instanceof Map && !(value instanceof RawObject))) {
			// Arrays and Dictionaries also need changes_parent for their elements
			for (const prop of out_prop.properties) {
				prop.changes_parent = true;
			}
		}

		return out_prop;
	}

	/**
	 * Checks if a value is a compound GDObject type (Vector3, Color, etc.) that requires
	 * parent reconstruction when editing sub-properties.
	 *
	 * Uses instanceof checks against actual GDObject classes from variants.ts to ensure
	 * we only match real compound types, not synthetic objects like the root inspector node.
	 */
	private isCompoundGDObject(value: any): boolean {
		if (!value) return false;

		// Check against actual GDObject class instances
		return value instanceof Vector2 ||
			value instanceof Vector2i ||
			value instanceof Vector3 ||
			value instanceof Vector3i ||
			value instanceof Vector4 ||
			value instanceof Vector4i ||
			value instanceof Color ||
			value instanceof Basis ||
			value instanceof AABB ||
			value instanceof Plane ||
			value instanceof Quat ||
			value instanceof Rect2 ||
			value instanceof Rect2i ||
			value instanceof Transform2D ||
			value instanceof Transform3D ||
			value instanceof Projection ||
			value instanceof NodePath ||
			value instanceof StringName;
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

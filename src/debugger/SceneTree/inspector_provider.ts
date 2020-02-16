import {
	TreeDataProvider,
	EventEmitter,
	Event,
	ProviderResult,
	TreeItem,
	TreeItemCollapsibleState
} from "vscode";
import { RemotePropertyBuilder } from "./tree_builders";

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
			this._on_did_change_tree_data.fire();
		}
	}

	public fill_tree(
		element_name: string,
		class_name: string,
		object_id: number,
		properties: any[]
	) {
		this.tree = RemotePropertyBuilder.build(
			element_name,
			class_name,
			object_id,
			properties
		);

		this.tree.description = class_name;
		this._on_did_change_tree_data.fire();
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
		switch (value.__type__) {
			case "Vector2":
				{
					let name = property.label;
					switch (name) {
						case "x":
							value.x = new_parsed_value;
							break;
						case "y":
							value.y = new_parsed_value;
							break;
					}
				}
				break;
			case "Rect2":
				{
					let name = property.label;
					let vector = parents[idx - 1].label;
					switch (vector) {
						case "position":
							switch (name) {
								case "x":
									value.position.x = new_parsed_value;
									break;
								case "y":
									value.position.y = new_parsed_value;
									break;
							}
							break;
						case "size":
							switch (name) {
								case "x":
									value.size.x = new_parsed_value;
									break;
								case "y":
									value.size.y = new_parsed_value;
									break;
							}
							break;
					}
				}
				break;
			case "Vector3":
				{
					let name = property.label;
					switch (name) {
						case "x":
							value.x = new_parsed_value;
							break;
						case "y":
							value.y = new_parsed_value;
							break;
						case "z":
							value.z = new_parsed_value;
							break;
					}
				}
				break;
			case "Transform2D":
				{
					let name = property.label;
					let vector = parents[idx - 1].label;
					switch (vector) {
						case "origin":
							switch (name) {
								case "x":
									value.position.x = new_parsed_value;
									break;
								case "y":
									value.position.y = new_parsed_value;
									break;
							}
							break;
						case "x":
							switch (name) {
								case "x":
									value.size.x = new_parsed_value;
									break;
								case "y":
									value.size.y = new_parsed_value;
									break;
							}
							break;
						case "y":
							switch (name) {
								case "x":
									value.size.x = new_parsed_value;
									break;
								case "y":
									value.size.y = new_parsed_value;
									break;
							}
							break;
					}
				}
				break;
			case "Plane":
				{
					let name = property.label;
					let subprop = parents[idx - 1].label;
					switch (subprop) {
						case "d":
							value.d = new_parsed_value;
							break;
						case "x":
							value.x = new_parsed_value;
							break;
						case "y":
							value.y = new_parsed_value;
							break;
						case "z":
							value.z = new_parsed_value;
							break;
						case "normal":
							switch (name) {
								case "x":
									value.normal.x = new_parsed_value;
									break;
								case "y":
									value.normal.y = new_parsed_value;
									break;
								case "z":
									value.normal.z = new_parsed_value;
									break;
							}
							break;
					}
				}
				break;
			case "Quat":
				{
					let name = property.label;
					switch (name) {
						case "x":
							value.x = new_parsed_value;
							break;
						case "y":
							value.y = new_parsed_value;
							break;
						case "z":
							value.z = new_parsed_value;
							break;
						case "w":
							value.w = new_parsed_value;
							break;
					}
				}
				break;
			case "AABB":
				{
					let name = property.label;
					let vector = parents[idx - 1].label;
					switch (vector) {
						case "end":
							switch (name) {
								case "x":
									value.end.x = new_parsed_value;
									break;
								case "y":
									value.end.y = new_parsed_value;
									break;
								case "z":
									value.end.z = new_parsed_value;
									break;
							}
							break;
						case "position":
							switch (name) {
								case "x":
									value.position.x = new_parsed_value;
									break;
								case "y":
									value.position.y = new_parsed_value;
									break;
								case "z":
									value.position.z = new_parsed_value;
									break;
							}
							break;
						case "size":
							switch (name) {
								case "x":
									value.size.x = new_parsed_value;
									break;
								case "y":
									value.size.y = new_parsed_value;
									break;
								case "z":
									value.size.z = new_parsed_value;
									break;
							}
							break;
					}
				}
				break;
			case "Basis":
				{
					let name = property.label;
					let vector = parents[idx - 1].label;
					switch (vector) {
						case "x":
							switch (name) {
								case "x":
									value.x.x = new_parsed_value;
									break;
								case "y":
									value.x.y = new_parsed_value;
									break;
								case "z":
									value.x.z = new_parsed_value;
									break;
							}
							break;
						case "y":
							switch (name) {
								case "x":
									value.y.x = new_parsed_value;
									break;
								case "y":
									value.y.y = new_parsed_value;
									break;
								case "z":
									value.y.z = new_parsed_value;
									break;
							}
							break;
						case "z":
							switch (name) {
								case "x":
									value.z.x = new_parsed_value;
									break;
								case "y":
									value.z.y = new_parsed_value;
									break;
								case "z":
									value.z.z = new_parsed_value;
									break;
							}
							break;
					}
				}
				break;
			case "Transform":
				{
					let name = property.label;
					let parent_name = parents[idx - 1].label;
					if (
						parent_name === "x" ||
						parent_name === "y" ||
						parent_name === "z"
					) {
						switch (name) {
							case "x":
								switch (parent_name) {
									case "x":
										value.basis.x.x = new_parsed_value;
										break;
									case "y":
										value.basis.x.y = new_parsed_value;
										break;
									case "z":
										value.basis.x.z = new_parsed_value;
										break;
								}
								break;
							case "y":
								switch (parent_name) {
									case "x":
										value.basis.y.x = new_parsed_value;
										break;
									case "y":
										value.basis.y.y = new_parsed_value;
										break;
									case "z":
										value.basis.y.z = new_parsed_value;
										break;
								}
								break;
							case "z":
								switch (parent_name) {
									case "x":
										value.basis.z.x = new_parsed_value;
										break;
									case "y":
										value.basis.z.y = new_parsed_value;
										break;
									case "z":
										value.basis.z.z = new_parsed_value;
										break;
								}
								break;
						}
					} else {
						switch (name) {
							case "x":
								value.origin.x = new_parsed_value;
								break;
							case "y":
								value.origin.y = new_parsed_value;
								break;
							case "z":
								value.origin.z = new_parsed_value;
								break;
						}
					}
				}
				break;
			case "Color":
				{
					let name = property.label;
					switch (name) {
						case "r":
							value.r = new_parsed_value;
							break;
						case "g":
							value.g = new_parsed_value;
							break;
						case "b":
							value.b = new_parsed_value;
							break;
						case "a":
							value.a = new_parsed_value;
							break;
					}
				}
				break;
			default:
				if (Array.isArray(value)) {
					let idx = parseInt(property.label);
					if (idx < value.length) {
						value[idx] = new_parsed_value;
					}
				}
				else if(value instanceof Map) {
					value.set(property.parent.value.key, new_parsed_value);
				}
				break;
		}

		return value;
	}

	public has_tree() {
		return this.tree !== undefined;
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

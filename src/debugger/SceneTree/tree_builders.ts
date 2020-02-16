import { SceneNode } from "./scene_tree_provider";
import { RemoteProperty, RemoteObject } from "./inspector_provider";
import stringify from "../stringify";
import { TreeItemCollapsibleState } from "vscode";

export class SceneTreeBuilder {
	public static build(params: any[]) {
		return this.parse_next(params, { offset: 0 });
	}

	private static parse_next(params: any[], ofs: { offset: number }): SceneNode {
		let child_count: number = params[ofs.offset++];
		let name: string = params[ofs.offset++];
		let class_name: string = params[ofs.offset++];
		let id: number = params[ofs.offset++];

		let children: SceneNode[] = [];
		for (let i = 0; i < child_count; ++i) {
			children.push(this.parse_next(params, ofs));
		}

		return new SceneNode(name, class_name, id, children);
	}
}

export class RemotePropertyBuilder {
	private static build_property(object_id: number, property: any[], is_dict_key?: boolean) {
		let prop_name: string = property[0];
		let prop_value: any = property[5];
		let is_remote_object = false;
		let is_primitive = false;

		let child_props: RemoteProperty[] = [];
		if (Array.isArray(prop_value) || prop_value instanceof Map) {
			let length = 0;
			let values: any[];
			if (prop_value instanceof Map) {
				length = prop_value.size;
				let keys = Array.from(prop_value.keys());
				values = keys.map(key => {
					let value = prop_value.get(key);
					let stringified_key = stringify(key).value;

					return {
						__type__: "Pair",
						key: key,
						value: value,
						__render__: () => stringified_key
					};
				});
			} else {
				length = prop_value.length;
				values = prop_value;
			}
			for (let i = 0; i < length; i++) {
				let name = `${i}`;
				let child_prop = this.build_property(object_id, [
					name,
					0,
					0,
					0,
					0,
					values[i]
				]);
				child_prop.changes_parent = true;
				child_props.push(child_prop);
			}
		} else if (typeof prop_value === "object") {
			if (prop_value.__type__ && prop_value.__type__ === "Object") {
				is_remote_object = true;
			} else {
				for (const PROP in prop_value) {
					if (PROP !== "__type__" && PROP !== "__render__") {
						let name = `${PROP}`;
						let child_prop = this.build_property(object_id, [
							name,
							0,
							0,
							0,
							0,
							prop_value[PROP]
						], prop_value.__type__ === "Pair" && name === "key");
						child_prop.changes_parent = true;
						child_props.push(child_prop);
					}
				}
			}
		} else if (!is_dict_key) {
			is_primitive = true;
		}

		let out_prop = new RemoteProperty(
			prop_name,
			prop_value,
			object_id,
			child_props,
			child_props.length === 0
				? TreeItemCollapsibleState.None
				: TreeItemCollapsibleState.Collapsed
		);
		out_prop.properties.forEach(prop => {
			prop.parent = out_prop;
		});
		out_prop.description = stringify(prop_value).value;
		if (is_remote_object) {
			out_prop.contextValue = "remote_object";
		} else if (is_primitive) {
			out_prop.contextValue = "editable_value";
		}
		return out_prop;
	}

	public static build(
		element_name: string,
		class_name: string,
		object_id: number,
		properties: any[][]
	) {
		let categories = [
			["Node", 0, 0, 0, 0, undefined],
			...properties.filter(value => value[5] === undefined)
		];

		let categorized_props: RemoteProperty[] = [];
		for (let i = 0; i < categories.length - 1; i++) {
			const category = categories[i];

			let props =
				i > 0
					? properties.slice(
							properties.findIndex(value => category === value) + 1,
							properties.findIndex(value => categories[i + 1] === value)
					  )
					: properties.slice(
							0,
							properties.findIndex(value => categories[1] === value)
					  );

			let out_props = props.map(value => {
				return this.build_property(object_id, value);
			});

			let category_prop = new RemoteProperty(
				category[0],
				undefined,
				object_id,
				out_props,
				TreeItemCollapsibleState.Expanded
			);

			categorized_props.push(category_prop);
		}

		let out = new RemoteProperty(
			element_name,
			undefined,
			object_id,
			categorized_props,
			TreeItemCollapsibleState.Expanded
		);
		out.description = class_name;
		return out;
	}
}

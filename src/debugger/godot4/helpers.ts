import { GodotVariable, RawObject } from "../debug_runtime";
import { SceneNode } from "../scene_tree_provider";

export function parse_next_scene_node(params: any[], ofs: { offset: number } = { offset: 0 }): SceneNode {
	const child_count: number = params[ofs.offset++];
	const name: string = params[ofs.offset++];
	const class_name: string = params[ofs.offset++];
	const id: number = params[ofs.offset++];
	const unknown1: string = params[ofs.offset++];
	const unknown2: number = params[ofs.offset++];

	const children: SceneNode[] = [];
	for (let i = 0; i < child_count; ++i) {
		children.push(parse_next_scene_node(params, ofs));
	}

	return new SceneNode(name, class_name, id, children);
}

export function is_variable_built_in_type(va: GodotVariable) {
	var type = typeof va.value;
	return ["number", "bigint", "boolean", "string"].some(x => x == type);
}

export function parse_variable(va: GodotVariable, i?: number) {
	// log.debug("parse_variable", JSON.stringify(va), i);
	const value = va.value;
	let rendered_value = "";
	let reference = 0;
	let array_size = 0;
	let array_type = undefined;

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
			array_size = value.length;
			array_type = "indexed";
			reference = i ? i : 0;
		} else if (value instanceof Map) {
			if (value instanceof RawObject) {
				rendered_value = `${value.class_name}`;
			} else {
				rendered_value = `Dictionary[${value.size}]`;
			}
			array_size = value.size;
			array_type = "named";
			reference = i ? i : 0;
		} else {
			rendered_value = `${value.type_name()}${value.stringify_value()}`;
			reference = i ? i : 0;
		}
	}

	return {
		name: va.name,
		value: rendered_value,
		variablesReference: reference,
		array_size: array_size > 0 ? array_size : undefined,
		filter: array_type,
	};
}

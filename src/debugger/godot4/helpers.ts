import { GodotVariable, } from "../debug_runtime";
import { SceneNode } from "../scene_tree_provider";

export function parse_next_scene_node(params: any[], ofs: { offset: number } = { offset: 0 }): SceneNode {
	const childCount: number = params[ofs.offset++];
	const name: string = params[ofs.offset++];
	const className: string = params[ofs.offset++];
	const id: number = params[ofs.offset++];
	const sceneFilePath: string = params[ofs.offset++];
	const viewFlags: number = params[ofs.offset++];

	const children: SceneNode[] = [];
	for (let i = 0; i < childCount; ++i) {
		children.push(parse_next_scene_node(params, ofs));
	}

	return new SceneNode(name, className, id, children, sceneFilePath, viewFlags);
}

export function split_buffers(buffer: Buffer) {
	let len = buffer.byteLength;
	let offset = 0;
	const buffers: Buffer[] = [];
	while (len > 0) {
		const subLength = buffer.readUInt32LE(offset) + 4;
		buffers.push(buffer.subarray(offset, offset + subLength));
		offset += subLength;
		len -= subLength;
	}

	return buffers;
}

export function is_variable_built_in_type(va: GodotVariable) {
	var type = typeof va.value;
	return ["number", "bigint", "boolean", "string"].some(x => x == type);
}

export function build_sub_values(va: GodotVariable) {
	const value = va.value;

	let subValues: GodotVariable[] = undefined;

	if (value && Array.isArray(value)) {
		subValues = value.map((va, i) => {
			return { name: `${i}`, value: va } as GodotVariable;
		});
	} else if (value instanceof Map) {
		subValues = Array.from(value.keys()).map((va) => {
			if (typeof va["stringify_value"] === "function") {
				return {
					name: `${va.type_name()}${va.stringify_value()}`,
					value: value.get(va),
				} as GodotVariable;
			} else {
				return {
					name: `${va}`,
					value: value.get(va),
				} as GodotVariable;
			}
		});
	} else if (value && typeof value["sub_values"] === "function") {
		subValues = value.sub_values().map((sva) => {
			return { name: sva.name, value: sva.value } as GodotVariable;
		});
	}

	va.sub_values = subValues;

	subValues?.forEach(build_sub_values);
}

export function parse_variable(va: GodotVariable, i?: number) {
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
			rendered_value = value["class_name"] ?? `Dictionary[${value.size}]`;
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

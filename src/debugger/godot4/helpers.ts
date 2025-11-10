import { GodotVariable } from "../debug_runtime";
import { SceneNode } from "../scene_tree_provider";
import { VariablesManager } from "./variables/variables_manager";
import { ObjectId, StringName } from "./variables/variants";

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

export async function get_sub_values(value: any, variables_manager: VariablesManager): Promise<GodotVariable[]> {
	let subValues: GodotVariable[] = undefined;

	if (value) {
		if (Array.isArray(value)) {
			subValues = value.map((val, i) => {
				const godot_id = val instanceof ObjectId ? val.id : undefined;
				return { id: godot_id, name: `${i}`, value: val } as GodotVariable;
			});
		} else if (value instanceof Map) {
			subValues = [];
			var key_name = "";
			for (const [key, val] of value.entries()) {
				if (typeof key?.get_rendered_value === "function") { //  (key instanceof ObjectId), (key instanceof StringName)
					key_name = await key.get_rendered_value(this.variables_manager);
				} else {
					key_name =
						typeof key.stringify_value === "function"
							? `${key.type_name()}${key.stringify_value()}`
							: `${key}`;
				}
				const godot_id = val instanceof ObjectId ? val.id : undefined;
				subValues.push({ id: godot_id, name: key_name, value: val } as GodotVariable);
			}
		} else if (typeof value.sub_values === "function") {
			subValues = value.sub_values()?.map((sva) => {
				return { name: sva.name, value: sva.value } as GodotVariable;
			});
		}
	}

	for (let i = 0; i < subValues?.length; i++) {
		subValues[i].sub_values = await get_sub_values(subValues[i].value, variables_manager);
	}

	return subValues;
}

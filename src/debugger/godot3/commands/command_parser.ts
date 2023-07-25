import { VariantEncoder } from "../variables/variant_encoder";

import { createLogger } from "../../../logger";

const log = createLogger("debugger.cmd_parser");

export class CommandParser {
	private encoder = new VariantEncoder();

	public make_break_command(): Buffer {
		return this.build_buffered_command("break");
	}

	public make_continue_command(): Buffer {
		return this.build_buffered_command("continue");
	}

	public make_inspect_object_command(object_id: bigint): Buffer {
		return this.build_buffered_command("inspect_object", [object_id]);
	}

	public make_next_command(): Buffer {
		return this.build_buffered_command("next");
	}

	public make_remove_breakpoint_command(path_to: string, line: number): Buffer {
		return this.build_buffered_command("breakpoint", [path_to, line, false]);
	}

	public make_request_scene_tree_command(): Buffer {
		return this.build_buffered_command("request_scene_tree");
	}

	public make_send_breakpoint_command(path_to: string, line: number): Buffer {
		return this.build_buffered_command("breakpoint", [path_to, line, true]);
	}

	public make_set_object_value_command(
		object_id: bigint,
		label: string,
		new_parsed_value: any
	): Buffer {
		return this.build_buffered_command("set_object_property", [
			object_id,
			label,
			new_parsed_value,
		]);
	}

	public make_stack_dump_command(): Buffer {
		return this.build_buffered_command("get_stack_dump");
	}

	public make_stack_frame_vars_command(frame_id: number): Buffer {
		return this.build_buffered_command("get_stack_frame_vars", [frame_id]);
	}

	public make_step_command() {
		return this.build_buffered_command("step");
	}

	private build_buffered_command(command: string, parameters?: any[]) {
		let command_array: any[] = [command];
		if (parameters) {
			parameters.forEach((param) => {
				command_array.push(param);
			});
		}

		let buffer = this.encoder.encode_variant(command_array);
		return buffer;
	}
}

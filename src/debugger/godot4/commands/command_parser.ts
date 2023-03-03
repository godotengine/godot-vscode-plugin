import { Command } from "./command";
import { CommandDebugEnter } from "./commands/command_debug_enter";
import { CommandOutput } from "./commands/command_output";
import { CommandStackDump } from "./commands/command_stack_dump";
import { CommandStackFrameVar } from "./commands/command_stack_frame_var";
import { CommandStackFrameVars } from "./commands/command_stack_frame_vars";
import { CommandMessageSceneTree } from "./commands/command_message_scene_tree";
import { CommandMessageInspectObject } from "./commands/command_message_inspect_object";
import { CommandDebugExit } from "./commands/command_debug_exit";
import { VariantEncoder } from "../variables/variant_encoder";

export class CommandParser {
	// TODO implements new commands like: set_pid, performance , etc...
	private commands: Map<string, () => Command> = new Map([
		[
			"output",
			function () {
				return new CommandOutput();
			},
		],
		[
			"scene:scene_tree",
			function () {
				return new CommandMessageSceneTree();
			},
		],
		[
			"scene:inspect_object",
			function () {
				return new CommandMessageInspectObject();
			},
		],
		[
			"stack_dump",
			function () {
				return new CommandStackDump();
			},
		],
		[
			"stack_frame_vars",
			function () {
				return new CommandStackFrameVars();
			},
		],
		[
			"stack_frame_var",
			function () {
				return new CommandStackFrameVar();
			},
		],
		[
			"debug_enter",
			function () {
				return new CommandDebugEnter();
			},
		],
		[
			"debug_exit",
			function () {
				return new CommandDebugExit();
			},
		],
	]);
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
		return this.build_buffered_command("scene:request_scene_tree");
	}

	public make_send_breakpoint_command(path_to: string, line: number): Buffer {
		return this.build_buffered_command("breakpoint", [path_to, line, true]);
	}

	public make_set_object_value_command(
		object_id: bigint,
		label: string,
		new_parsed_value: any
	): Buffer {
		return this.build_buffered_command("scene:set_object_property", [
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

	public parse_message(command: string, params: any[]) {

		const current_command = this.commands.get(command);
		// Avoid get commands null
		if (!current_command) {
			return;
		}
		try {
			current_command().trigger(params);
		} catch (e) {
			// class_name is the key of Mediator.inspect_callbacks
			console.error("Catch exception during trigger command: " + e);
		}
	}

	private build_buffered_command(command: string, parameters?: any[]) {
		let command_array: any[] = [command, parameters ?? []];
		let buffer = this.encoder.encode_variant(command_array);
		return buffer;
	}
}
import { Command } from "./command";
import { CommandDebugEnter } from "./commands/command_debug_enter";
import { CommandOutput } from "./commands/command_output";
import { CommandStackDump } from "./commands/command_stack_dump";
import { CommandStackFrameVars } from "./commands/command_stack_frame_vars";
import { CommandNull } from "./commands/command_null";
import { CommandMessageSceneTree } from "./commands/command_message_scene_tree";
import { CommandMessageInspectObject } from "./commands/command_message_inspect_object";
import { CommandDebugExit } from "./commands/command_debug_exit";
import { VariantEncoder } from "../variables/variant_encoder";

export class CommandParser {
	private commands: Map<string, () => Command> = new Map([
		[
			"output",
			function () {
				return new CommandOutput();
			},
		],
		[
			"message:scene_tree",
			function () {
				return new CommandMessageSceneTree();
			},
		],
		[
			"message:inspect_object",
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
	private current_command?: Command;
	private encoder = new VariantEncoder();
	private parameters: any[] = [];

	public has_command() {
		return this.current_command;
	}

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

	public parse_message(dataset: any[]) {
		while (dataset && dataset.length > 0) {
			if (this.current_command) {
				this.parameters.push(dataset.shift());
				if (this.current_command.param_count !== -1) {
					if (this.current_command.param_count === this.parameters.length) {
						try {
							this.current_command.trigger(this.parameters);
						} catch (e) {
							// FIXME: Catch exception during trigger command: TypeError: class_name.replace is not a function
							// class_name is the key of Mediator.inspect_callbacks
							console.error("Catch exception during trigger command: " + e);
						} finally {
							this.current_command = undefined;
							this.parameters = [];
						}
					} else if(this.current_command.param_count < this.parameters.length) {
						// we debugged that an exception occures during this.current_command.trigger(this.parameters)
						// because we do not understand the root cause of the exception, we set the current command to undefined
						// to avoid a infinite loop of parse_message(...)
						this.current_command = undefined;
						this.parameters = [];
						console.log("Exception not catched. Reset current_command to avoid infinite loop.");
					}
				} else {
					this.current_command.param_count = this.parameters.shift();
					if (this.current_command.param_count === 0) {
						this.current_command.trigger([]);
						this.current_command = undefined;
					}
				}
			} else {
				let data = dataset.shift();
				if (data && this.commands.has(data)) {
					this.current_command = this.commands.get(data)();
				} else {
					this.current_command = new CommandNull();
				}
			}
		}
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

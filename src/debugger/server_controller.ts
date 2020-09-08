import { CommandParser } from "./commands/command_parser";
import { Mediator } from "./mediator";
import { VariantDecoder } from "./variables/variant_decoder";
import {
	GodotBreakpoint,
	GodotStackFrame,
	GodotDebugData,
} from "./debug_runtime";
import { window } from "vscode";
const TERMINATE = require("terminate");
import net = require("net");
import utils = require("../utils");
import cp = require("child_process");
import path = require("path");

export class ServerController {
	private command_buffer: Buffer[] = [];
	private commands = new CommandParser();
	private debug_data: GodotDebugData;
	private decoder = new VariantDecoder();
	private draining = false;
	private exception = "";
	private godot_pid: number;
	private server?: net.Server;
	private socket?: net.Socket;
	private stepping_out = false;
	private terminated = false;

	public break() {
		this.add_and_send(this.commands.make_break_command());
	}

	public continue() {
		this.add_and_send(this.commands.make_continue_command());
	}

	public next() {
		this.add_and_send(this.commands.make_next_command());
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.debug_data.remove_breakpoint(path_to, line);
		this.add_and_send(
			this.commands.make_remove_breakpoint_command(path_to, line)
		);
	}

	public send_inspect_object_request(object_id: bigint) {
		this.add_and_send(this.commands.make_inspect_object_command(object_id));
	}

	public send_request_scene_tree_command() {
		this.add_and_send(this.commands.make_request_scene_tree_command());
	}

	public send_scope_request(frame_id: number) {
		this.add_and_send(this.commands.make_stack_frame_vars_command(frame_id));
	}

	public set_breakpoint(path_to: string, line: number) {
		this.add_and_send(
			this.commands.make_send_breakpoint_command(path_to, line)
		);
	}

	public set_exception(exception: string) {
		this.exception = exception;
	}

	public set_object_property(
		object_id: bigint,
		label: string,
		new_parsed_value: any
	) {
		this.add_and_send(
			this.commands.make_set_object_value_command(
				BigInt(object_id),
				label,
				new_parsed_value
			)
		);
	}

	public stack_dump() {
		this.add_and_send(this.commands.make_stack_dump_command());
	}

	public start(
		project_path: string,
		address: string,
		port: number,
		launch_instance: boolean,
		launch_scene: boolean,
		scene_file: string | undefined,
		debug_data: GodotDebugData
	) {
		this.debug_data = debug_data;

		if (launch_instance) {
			let godot_path: string = utils.get_configuration("editor_path", "godot");
			let executable_line = `"${godot_path}" --path "${project_path}" --remote-debug ${address}:${port}`;
			if (launch_scene) {
				let filename = "";
				if (scene_file) {
					filename = scene_file;
				} else {
					filename = window.activeTextEditor.document.fileName;
				}
				executable_line += ` "${filename}"`;
			}
			executable_line += this.breakpoint_string(
				debug_data.get_all_breakpoints(),
				project_path
			);
			let godot_exec = cp.exec(executable_line, (error) => {
				if (!this.terminated) {
					window.showErrorMessage(`Failed to launch Godot instance: ${error}`);
				}
			});
			this.godot_pid = godot_exec.pid;
		}

		this.server = net.createServer((socket) => {
			this.socket = socket;

			if (!launch_instance) {
				let breakpoints = this.debug_data.get_all_breakpoints();
				breakpoints.forEach((bp) => {
					this.set_breakpoint(
						this.breakpoint_path(project_path, bp.file),
						bp.line
					);
				});
			}

			socket.on("data", (buffer) => {
				let buffers = this.split_buffers(buffer);
				while (buffers.length > 0) {
					let sub_buffer = buffers.shift();
					let data = this.decoder.get_dataset(sub_buffer, 0).slice(1);
					this.commands.parse_message(data);
				}
			});

			socket.on("close", (had_error) => {
				Mediator.notify("stop");
			});

			socket.on("end", () => {
				Mediator.notify("stop");
			});

			socket.on("error", (error) => {
				Mediator.notify("error", [error]);
			});

			socket.on("drain", () => {
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		this.server.listen(port, address);
	}

	public step() {
		this.add_and_send(this.commands.make_step_command());
	}

	public step_out() {
		this.stepping_out = true;
		this.add_and_send(this.commands.make_next_command());
	}

	public stop() {
		this.socket?.destroy();
		this.server?.close((error) => {
			if (error) {
				console.log(error);
			}
			this.server.unref();
			this.server = undefined;
		});

		if (this.godot_pid) {
			this.terminate();
		}
	}

	private terminate() {
		this.terminated = true;
		TERMINATE(this.godot_pid);
		this.godot_pid = undefined;
	}

	public trigger_breakpoint(stack_frames: GodotStackFrame[]) {
		let continue_stepping = false;
		let stack_count = stack_frames.length;

		let file = stack_frames[0].file.replace(
			"res://",
			`${this.debug_data.project_path}/`
		);
		let line = stack_frames[0].line;

		if (this.stepping_out) {
			let breakpoint = this.debug_data
				.get_breakpoints(file)
				.find((bp) => bp.line === line);
			if (!breakpoint) {
				if (this.debug_data.stack_count > 1) {
					continue_stepping = this.debug_data.stack_count === stack_count;
				} else {
					let file_same =
						stack_frames[0].file === this.debug_data.last_frame.file;
					let func_same =
						stack_frames[0].function === this.debug_data.last_frame.function;
					let line_greater =
						stack_frames[0].line >= this.debug_data.last_frame.line;

					continue_stepping = file_same && func_same && line_greater;
				}
			}
		}

		this.debug_data.stack_count = stack_count;
		this.debug_data.last_frame = stack_frames[0];

		if (continue_stepping) {
			this.next();
			return;
		}

		this.stepping_out = false;

		this.debug_data.stack_files = stack_frames.map((sf) => {
			return sf.file;
		});

		if (this.exception.length === 0) {
			Mediator.notify("stopped_on_breakpoint", [stack_frames]);
		} else {
			Mediator.notify("stopped_on_exception", [stack_frames, this.exception]);
		}
	}

	private add_and_send(buffer: Buffer) {
		this.command_buffer.push(buffer);
		this.send_buffer();
	}

	private breakpoint_path(project_path: string, file: string) {
		let relative_path = path.relative(project_path, file).replace(/\\/g, "/");
		if (relative_path.length !== 0) {
			return `res://${relative_path}`;
		}
		return undefined;
	}

	private breakpoint_string(
		breakpoints: GodotBreakpoint[],
		project_path: string
	) {
		let output = "";
		if (breakpoints.length > 0) {
			output += " --breakpoints ";
			breakpoints.forEach((bp, i) => {
				output += `${this.breakpoint_path(project_path, bp.file)}:${bp.line}${
					i < breakpoints.length - 1 ? "," : ""
				}`;
			});
		}

		return output;
	}

	private send_buffer() {
		if (!this.socket) {
			return;
		}

		while (!this.draining && this.command_buffer.length > 0) {
			this.draining = !this.socket.write(this.command_buffer.shift());
		}
	}

	private split_buffers(buffer: Buffer) {
		let len = buffer.byteLength;
		let offset = 0;
		let buffers: Buffer[] = [];
		while (len > 0) {
			let sub_len = buffer.readUInt32LE(offset) + 4;
			buffers.push(buffer.slice(offset, offset + sub_len));
			offset += sub_len;
			len -= sub_len;
		}

		return buffers;
	}
}

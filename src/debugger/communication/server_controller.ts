const TERMINATE = require("terminate");
import { EventEmitter } from "events";
import net = require("net");
import cp = require("child_process");
import path = require("path");
import { VariantParser } from "../variant_parser";
import { Command } from "./command";
import vscode = require("vscode");
import { GodotCommands } from "./godot_commands";
import { CommandBuilder } from "./command_builder";
import { GodotBreakpoint, GodotStackFrame } from "../godot_debug_runtime";
import utils = require("../../utils");

export class ServerController {
	private breakpoints: { file: string; line: number }[] = [];
	private builder: CommandBuilder | undefined;
	private connection: net.Socket | undefined;
	private emitter: EventEmitter;
	private exception = "";
	private godot_commands: GodotCommands | undefined;
	private godot_pid: number | undefined;
	private inspected_callbacks: ((
		class_name: string,
		properties: any[]
	) => void)[] = [];
	private last_frame:
		| { line: number; file: string; function: string }
		| undefined;
	private output_channel: vscode.OutputChannel | undefined;
	private parser: VariantParser | undefined;
	private project_path: string;
	private scope_callbacks: ((
		stack_level: number,
		stack_files: string[],
		scopes: {
			locals: { name: string; value: any }[];
			members: { name: string; value: any }[];
			globals: { name: string; value: any }[];
		}
	) => void)[] = [];
	private server: net.Server | undefined;
	private stack_count = 0;
	private stack_files: string[] = [];
	private stack_level = 0;
	private stepping_out = false;

	constructor(
		event_emitter: EventEmitter,
		output_channel?: vscode.OutputChannel
	) {
		this.emitter = event_emitter;
		this.output_channel = output_channel;
	}

	public break() {
		this.godot_commands?.send_break_command();
	}

	public continue() {
		this.godot_commands?.send_continue_Command();
	}

	public get_scope(
		level: number,
		callback?: (
			stack_level: number,
			stack_files: string[],
			scopes: {
				locals: { name: string; value: any }[];
				members: { name: string; value: any }[];
				globals: { name: string; value: any }[];
			}
		) => void
	) {
		this.godot_commands?.send_stack_frame_vars_command(level);
		this.stack_level = level;
		if (callback) {
			this.scope_callbacks.push(callback);
		}
	}

	public inspect_object(
		id: number,
		inspected: (class_name: string, properties: any[]) => void
	) {
		this.inspected_callbacks.push(inspected);
		this.godot_commands?.send_inspect_object_command(id);
	}

	public next() {
		this.godot_commands?.send_next_command();
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.breakpoints.splice(
			this.breakpoints.findIndex(bp => bp.file === path_to && bp.line === line),
			1
		);
		this.godot_commands?.send_remove_breakpoint_command(path_to, line);
	}

	public set_breakpoint(path_to: string, line: number) {
		this.breakpoints.push({ file: path_to, line: line });
		this.godot_commands?.send_set_breakpoint_command(path_to, line);
	}

	public start(
		project_path: string,
		port: number,
		address: string,
		launch_game_instance?: boolean,
		breakpoints?: GodotBreakpoint[]
	) {
		this.builder = new CommandBuilder();
		this.parser = new VariantParser();
		this.project_path = project_path.replace(/\\/g, "/");
		if (this.project_path.match(/^[A-Z]:\//)) {
			this.project_path =
				this.project_path[0].toLowerCase() + this.project_path.slice(1);
		}
		this.godot_commands = new GodotCommands(this.builder, this.parser);

		if (breakpoints) {
			this.breakpoints = breakpoints.map(bp => {
				return { file: bp.file, line: bp.line };
			});
		}

		this.builder.register_command(new Command("debug_exit", params => {}));

		this.builder.register_command(
			new Command("debug_enter", params => {
				let reason = params[1];
				if (reason !== "Breakpoint") {
					this.exception = params[1];
				} else {
					this.exception = "";
				}
				this.godot_commands?.send_stack_dump_command();
			})
		);

		this.builder.register_command(
			new Command("stack_dump", params => {
				let frames: Map<string, any>[] = params;
				this.trigger_breakpoint(
					frames.map((sf, i) => {
						return {
							id: i,
							thread_id: sf.get("id"),
							file: sf.get("file"),
							function: sf.get("function"),
							line: sf.get("line")
						};
					})
				);
			})
		);

		this.builder.register_command(
			new Command("output", params => {
				params.forEach(line => {
					this.output_channel?.appendLine(line);
				});
			})
		);

		this.builder.register_command(
			new Command("error", params => {
				params.forEach(param => {});
			})
		);

		this.builder.register_command(new Command("performance", params => {}));

		this.builder.register_command(
			new Command("message:inspect_object", params => {
				let id = params[0];
				let class_name = params[1];
				let properties = params[2];

				let callback = this.inspected_callbacks.shift();
				if (callback) {
					callback(class_name, properties);
				}
			})
		);

		this.builder.register_command(
			new Command("stack_frame_vars", params => {
				let locals: any[] = [];
				let members: any[] = [];
				let globals: any[] = [];

				let local_count = (params[0] as number) * 2;
				let member_count = params[1 + local_count] * 2;
				let global_count = params[2 + local_count + member_count] * 2;

				if (local_count > 0) {
					locals = params.slice(1, 1 + local_count);
				}
				if (member_count > 0) {
					members = params.slice(
						2 + local_count,
						2 + local_count + member_count
					);
				}
				if (global_count > 0) {
					globals = params.slice(
						3 + local_count + member_count,
						3 + local_count + member_count + global_count
					);
				}

				this.pumpScope(
					{
						locals: locals,
						members: members,
						globals: globals
					},
					project_path
				);
			})
		);

		this.server = net.createServer(connection => {
			this.connection = connection;
			this.godot_commands?.set_connection(connection);

			if (!launch_game_instance) {
				this.breakpoints.forEach(bp => {
					let path_to = path
						.relative(this.project_path, bp.file)
						.replace(/\\/g, "/");
					this.godot_commands?.send_set_breakpoint_command(
						`res://${path_to}`,
						bp.line
					);
				});
			}

			connection.on("data", buffer => {
				if (!this.parser || !this.builder) {
					return;
				}

				let len = buffer.byteLength;
				let offset = 0;
				do {
					let data = this.parser.get_buffer_dataset(buffer, offset);
					let data_offset = data[0] as number;
					offset += data_offset;
					len -= data_offset;
					this.builder.parse_data(data.slice(1));
				} while (len > 0);
			});

			connection.on("close", hadError => {
				if (hadError) {
					this.send_event("terminated");
				}
			});

			connection.on("end", () => {
				this.send_event("terminated");
			});

			connection.on("error", error => {
				console.error(error);
			});

			connection.on("drain", () => {
				connection.resume();
				this.godot_commands?.set_can_write(true);
			});
		});

		this.server?.listen(port, address);

		if (launch_game_instance) {
			let godot_path = utils.get_configuration(
				"editor_path",
				"godot"
			) as string;
			let executable_line = `${godot_path} --path ${project_path} --remote-debug ${address}:${port}`;
			executable_line += this.build_breakpoint_string(
				breakpoints,
				project_path
			);
			let godot_exec = cp.exec(executable_line);
			this.godot_pid = godot_exec.pid;
		}
	}

	public step() {
		this.godot_commands?.send_step_command();
	}

	public step_out() {
		this.stepping_out = true;
		this.next();
	}

	public stop() {
		this.connection?.end(() => {
			this.server?.close();
			if (this.godot_pid) {
				TERMINATE(this.godot_pid, (error: string | undefined) => {
					if (error) {
						console.error(error);
					}
				});
			}
		});
		this.send_event("terminated");
	}

	private build_breakpoint_string(
		breakpoints: GodotBreakpoint[],
		project: string
	): string {
		let output = "";
		if (breakpoints.length > 0) {
			output += " --breakpoints ";

			breakpoints.forEach(bp => {
				let relative_path = path.relative(project, bp.file).replace(/\\/g, "/");
				if (relative_path.length !== 0) {
					output += `res://${relative_path}:${bp.line},`;
				}
			});
			output = output.slice(0, -1);
		}

		return output;
	}

	private pumpScope(
		scopes: {
			locals: any[];
			members: any[];
			globals: any[];
		},
		projectPath: string
	) {
		if (this.scope_callbacks.length > 0) {
			let cb = this.scope_callbacks.shift();
			if (cb) {
				let stack_files = this.stack_files.map(sf => {
					return sf.replace("res://", `${projectPath}/`);
				});
				cb(this.stack_level, stack_files, scopes);
			}
		}
	}

	private send_event(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emitter.emit(event, ...args);
		});
	}

	private trigger_breakpoint(stack_frames: GodotStackFrame[]) {
		let continue_stepping = false;
		let stack_count = stack_frames.length;

		let file = stack_frames[0].file.replace("res://", `${this.project_path}/`);
		let line = stack_frames[0].line;

		if (this.stepping_out) {
			let breakpoint = this.breakpoints.find(
				k => k.file === file && k.line === line
			);
			if (!breakpoint) {
				if (this.stack_count > 1) {
					continue_stepping = this.stack_count === stack_count;
				} else {
					let file_same = stack_frames[0].file === this.last_frame.file;
					let func_same = stack_frames[0].function === this.last_frame.function;
					let line_greater = stack_frames[0].line >= this.last_frame.line;

					continue_stepping = file_same && func_same && line_greater;
				}
			}
		}
		this.stack_count = stack_count;
		this.last_frame = stack_frames[0];

		if (continue_stepping) {
			this.next();
			return;
		}

		this.stepping_out = false;

		this.stack_files = stack_frames.map(sf => {
			return sf.file;
		});
		if (this.exception.length === 0) {
			this.send_event("stopOnBreakpoint", stack_frames);
		} else {
			this.send_event("stopOnException", stack_frames, this.exception);
		}
	}
}

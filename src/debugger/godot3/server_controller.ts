import { CommandParser } from "./commands/command_parser";
import { VariantDecoder } from "./variables/variant_decoder";
import { RawObject } from "./variables/variants";
import {
	GodotBreakpoint,
	GodotStackFrame,
	GodotDebugData,
	GodotVariable,
} from "../debug_runtime";
import { GodotDebugSession } from "./debug_session";
import { SceneNode } from "../scene_tree_provider";
import { window, OutputChannel } from "vscode";
import { kill } from "process";
import net = require("net");
import { Command } from "./command";
import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import utils = require("../../utils");
import cp = require("child_process");
import path = require("path");
import { createLogger } from "../../logger";
import {
	LaunchRequestArguments,
	AttachRequestArguments
} from "./debug_session";

const log = createLogger("debugger.controller");

function parse_next(params: any[], ofs: { offset: number }): SceneNode {
	const child_count: number = params[ofs.offset++];
	const name: string = params[ofs.offset++];
	const class_name: string = params[ofs.offset++];
	const id: number = params[ofs.offset++];

	const children: SceneNode[] = [];
	for (let i = 0; i < child_count; ++i) {
		children.push(parse_next(params, ofs));
	}

	return new SceneNode(name, class_name, id, children);
}

export class ServerController {
	public session?: GodotDebugSession;
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
	private current_command: Command = undefined;
	private output: OutputChannel = window.createOutputChannel("Godot");
	private first_output: boolean = false;

	public constructor(session: GodotDebugSession) {
		this.session = session;
	}

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
		log.info("remove_breakpoint");

		this.debug_data.remove_breakpoint(path_to, line);
		this.add_and_send(
			this.commands.make_remove_breakpoint_command(path_to, line)
		);
	}

	public send_inspect_object_request(object_id: bigint) {
		log.debug("send_inspect_object_request", object_id);
		this.add_and_send(this.commands.make_inspect_object_command(object_id));
	}

	public send_request_scene_tree_command() {
		this.add_and_send(this.commands.make_request_scene_tree_command());
	}

	public send_scope_request(frame_id: number) {
		this.add_and_send(this.commands.make_stack_frame_vars_command(frame_id));
	}

	public set_breakpoint(path_to: string, line: number) {

		log.info("set_breakpoint");
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

	public launch(
		args: LaunchRequestArguments,
		debug_data: GodotDebugData
	) {
		log.info("launch");
		this.debug_data = debug_data;

		const godot_path: string = utils.get_configuration("editorPath.godot3", "godot");
		const force_visible_collision_shapes = utils.get_configuration("forceVisibleCollisionShapes", false);
		const force_visible_nav_mesh = utils.get_configuration("forceVisibleNavMesh", false);

		let executable_line = `"${godot_path}" --path "${args.project}" --remote-debug ${args.address}:${args.port}`;

		if (force_visible_collision_shapes) {
			executable_line += " --debug-collisions";
		}
		if (force_visible_nav_mesh) {
			executable_line += " --debug-navigation";
		}
		let filename = "";
		if (args.scene_file) {
			filename = args.scene_file;
		} else {
			filename = window.activeTextEditor.document.fileName;
		}
		executable_line += ` "${filename}"`;

		if (args.additional_options) {
			executable_line += " " + args.additional_options;
		}
		executable_line += this.breakpoint_string(
			debug_data.get_all_breakpoints(),
			args.project
		);
		log.debug(`executable_line: ${executable_line}`);
		const godot_exec = cp.exec(executable_line, (error) => {
			if (!this.terminated) {
				window.showErrorMessage(`Failed to launch Godot instance: ${error}`);
			}
		});
		this.godot_pid = godot_exec.pid;

		log.debug(`godot_pid: ${this.godot_pid}`);

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", (buffer) => {
				const buffers = this.split_buffers(buffer);
				while (buffers.length > 0) {
					const sub_buffer = buffers.shift();
					const data = this.decoder.get_dataset(sub_buffer, 0).slice(1);
					this.parse_message(data);
				}
			});

			socket.on("close", (had_error) => {
				log.debug("socket close");
				this.session?.sendEvent(new TerminatedEvent());
				this.stop();
			});

			socket.on("end", () => {
				log.debug("socket end");
				this.session?.sendEvent(new TerminatedEvent());
				this.stop();
			});

			socket.on("error", (error) => {
				log.debug("socket error");
				// this.session?.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("drain", () => {
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		this.server.listen(args.port, args.address);
	}

	public attach(
		args: AttachRequestArguments,
		debug_data: GodotDebugData
	) {
		this.debug_data = debug_data;

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", (buffer) => {
				const buffers = this.split_buffers(buffer);
				while (buffers.length > 0) {
					const sub_buffer = buffers.shift();
					const data = this.decoder.get_dataset(sub_buffer, 0).slice(1);
					this.parse_message(data);
				}
			});

			socket.on("close", (had_error) => {
				log.debug("socket close");
				// this.session?.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("end", () => {
				log.debug("socket end");
				// this.session?.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("error", (error) => {
				// Mediator.notify("error", [error]);
			});

			socket.on("drain", () => {
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		this.server.listen(args.port, args.address);
	}


	public parse_message(dataset: any[]) {
		if (this.current_command == undefined) {
			this.current_command = new Command();
			this.current_command.command = dataset.shift();
		}

		while (dataset && dataset.length > 0) {
			if (this.current_command.param_count === -1) {
				this.current_command.param_count = dataset.shift();
			} else {
				this.current_command.parameters.push(dataset.shift());
			}

			if (this.current_command.param_count === this.current_command.parameters.length) {
				this.current_command.complete = true;
			}
		}

		if (this.current_command.complete) {
			try {
				this.handle_command(this.current_command);
			} catch {
				//
			}

			this.current_command = undefined;
		}
	}

	public handle_command(command: Command) {
		// log.debug("handle_command", command.command, JSON.stringify(command.parameters));
		// log.debug("handle_command", command.command);
		switch (command.command) {
			case "debug_enter": {
				log.debug(command.command, JSON.stringify(command.parameters));
				const reason: string = command.parameters[1];
				if (reason !== "Breakpoint") {
					this.set_exception(reason);
				} else {
					this.set_exception("");
				}
				this.stack_dump();
				break;
			}
			case "debug_exit":
				break;
			case "message:click_ctrl ":
				// TODO: what is this?
				break;
			case "message:scene_tree": {
				const tree = parse_next(command.parameters, { offset: 0 });
				this.session?.debug_data?.scene_tree?.fill_tree(tree);
				break;
			}
			case "message:inspect_object": {
				log.debug(command.command, JSON.stringify(command.parameters));
				const id = BigInt(command.parameters[0]);
				const class_name: string = command.parameters[1];
				const properties: any[] = command.parameters[2];

				const raw_object = new RawObject(class_name);
				properties.forEach((prop) => {
					raw_object.set(prop[0], prop[5]);
				});
				const inspected_variable = { name: "", value: raw_object };
				this.build_sub_values(inspected_variable);
				if (this.session?.inspect_callbacks.has(Number(id))) {
					this.session?.inspect_callbacks.get(Number(id))(
						inspected_variable.name,
						inspected_variable
					);
					this.session?.inspect_callbacks.delete(Number(id));
				}
				this.session?.set_inspection(id, inspected_variable);
				break;
			}
			case "stack_dump": {
				log.debug(command.command, JSON.stringify(command.parameters));
				const frames: GodotStackFrame[] = command.parameters.map((sf, i) => {
					return {
						id: i,
						file: sf.get("file"),
						function: sf.get("function"),
						line: sf.get("line"),
					};
				});
				this.trigger_breakpoint(frames);
				this.send_request_scene_tree_command();
				break;
			}
			case "stack_frame_vars": {
				let globals: any[] = [];
				let locals: any[] = [];
				let members: any[] = [];

				const local_count = command.parameters[0] * 2;
				const member_count = command.parameters[1 + local_count] * 2;
				const global_count = command.parameters[2 + local_count + member_count] * 2;

				if (local_count > 0) {
					const offset = 1;
					locals = command.parameters.slice(offset, offset + local_count);
				}

				if (member_count > 0) {
					const offset = 2 + local_count;
					members = command.parameters.slice(offset, offset + member_count);
				}

				if (global_count > 0) {
					const offset = 3 + local_count + member_count;
					globals = command.parameters.slice(offset, offset + global_count);
				}
				this.do_stack_frame_vars(locals, members, globals);
				break;
			}
			case "output": {
				if (!this.first_output) {
					this.first_output = true;
					this.output.show(true);
					this.output.clear();
					this.send_request_scene_tree_command();
				}

				const lines: string[] = command.parameters;
				lines.forEach((line) => {
					const message_content: string = line[0];
					//const message_kind: number = line[1];

					// OutputChannel doesn't give a way to distinguish between a
					// regular string (message_kind == 0) and an error string (message_kind == 1).

					this.output.appendLine(message_content);
				});
				break;
			}
		}
	}

	public step() {
		this.add_and_send(this.commands.make_step_command());
	}

	public step_out() {
		this.stepping_out = true;
		this.add_and_send(this.commands.make_next_command());
	}

	public stop() {
		log.debug("stop");
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

	public terminate() {
		log.debug("terminate", this.godot_pid);
		this.terminated = true;
		if (this.godot_pid) {
			kill(this.godot_pid);
			this.godot_pid = undefined;
		}
	}

	public trigger_breakpoint(stack_frames: GodotStackFrame[]) {
		let continue_stepping = false;
		const stack_count = stack_frames.length;

		const file = stack_frames[0].file.replace(
			"res://",
			`${this.debug_data.project_path}/`
		);
		const line = stack_frames[0].line;

		if (this.stepping_out) {
			const breakpoint = this.debug_data
				.get_breakpoints(file)
				.find((bp) => bp.line === line);
			if (!breakpoint) {
				if (this.debug_data.stack_count > 1) {
					continue_stepping = this.debug_data.stack_count === stack_count;
				} else {
					const file_same =
						stack_frames[0].file === this.debug_data.last_frame.file;
					const func_same =
						stack_frames[0].function === this.debug_data.last_frame.function;
					const line_greater =
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
			this.session?.sendEvent(new StoppedEvent("breakpoint", 0));
		} else {
			this.session?.set_exception(true);
			this.session?.sendEvent(
				new StoppedEvent("exception", 0, this.exception)
			);
		}
	}

	private add_and_send(buffer: Buffer) {
		this.command_buffer.push(buffer);
		this.send_buffer();
	}

	private breakpoint_path(project_path: string, file: string) {
		const relative_path = path.relative(project_path, file).replace(/\\/g, "/");
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
				output += `${this.breakpoint_path(project_path, bp.file)}:${bp.line}${i < breakpoints.length - 1 ? "," : ""
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
		const buffers: Buffer[] = [];
		while (len > 0) {
			const sub_len = buffer.readUInt32LE(offset) + 4;
			buffers.push(buffer.slice(offset, offset + sub_len));
			offset += sub_len;
			len -= sub_len;
		}

		return buffers;
	}

	private build_sub_values(va: GodotVariable) {
		const value = va.value;

		let sub_values: GodotVariable[] = undefined;

		if (value && Array.isArray(value)) {
			sub_values = value.map((va, i) => {
				return { name: `${i}`, value: va } as GodotVariable;
			});
		} else if (value instanceof Map) {
			sub_values = Array.from(value.keys()).map((va) => {
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
			sub_values = value.sub_values().map((sva) => {
				return { name: sva.name, value: sva.value } as GodotVariable;
			});
		}

		va.sub_values = sub_values;

		sub_values?.forEach((sva) => this.build_sub_values(sva));
	}

	private do_stack_frame_vars(
		locals: any[],
		members: any[],
		globals: any[]
	) {
		const locals_out: GodotVariable[] = [];
		const members_out: GodotVariable[] = [];
		const globals_out: GodotVariable[] = [];

		for (
			let i = 0;
			i < locals.length + members.length + globals.length;
			i += 2
		) {
			const name =
				i < locals.length
					? locals[i]
					: i < members.length + locals.length
						? members[i - locals.length]
						: globals[i - locals.length - members.length];

			const value =
				i < locals.length
					? locals[i + 1]
					: i < members.length + locals.length
						? members[i - locals.length + 1]
						: globals[i - locals.length - members.length + 1];

			const variable: GodotVariable = {
				name: name,
				value: value,
			};

			this.build_sub_values(variable);

			i < locals.length
				? locals_out.push(variable)
				: i < members.length + locals.length
					? members_out.push(variable)
					: globals_out.push(variable);
		}

		this.session?.set_scopes(locals_out, members_out, globals_out);
	}
}

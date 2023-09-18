import { CommandParser } from "./commands/command_parser";
import { VariantDecoder } from "./variables/variant_decoder";
import { VariantEncoder } from "./variables/variant_encoder";
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
import TERMINATE from "terminate";
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
	const unknown1: string = params[ofs.offset++];
	const unknown2: number = params[ofs.offset++];

	const children: SceneNode[] = [];
	for (let i = 0; i < child_count; ++i) {
		children.push(parse_next(params, ofs));
	}

	return new SceneNode(name, class_name, id, children);
}

export class ServerController {
	public session?: GodotDebugSession;
	private command_buffer: Buffer[] = [];
	private debug_data: GodotDebugData;
	private decoder = new VariantDecoder();
	private encoder = new VariantEncoder();
	private draining = false;
	private exception = "";
	private godot_pid: number;
	private server?: net.Server;
	private socket?: net.Socket;
	private stepping_out = false;
	private terminated = false;
	private output: OutputChannel = window.createOutputChannel("Godot");
	private first_output: boolean = false;
	private partial_stack_vars = {
		locals: [] as GodotVariable[],
		members: [] as GodotVariable[],
		globals: [] as GodotVariable[],
		remaining: 0,
	};

	public constructor(session: GodotDebugSession) {
		this.session = session;
	}

	public break() {
		log.info("break");
		this.send_command("break");
	}

	public continue() {
		log.info("continue");
		this.send_command("continue");
	}

	public next() {
		log.info("next");
		this.send_command("next");
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.debug_data.remove_breakpoint(path_to, line);
		this.send_command("breakpoint", [path_to, line, false]);
	}

	public send_inspect_object_request(object_id: bigint) {
		this.send_command("inspect_object", [object_id]);
	}

	public send_request_scene_tree_command() {
		this.send_command("scene:request_scene_tree");
	}

	public send_scope_request(frame_id: number) {
		log.info("send_scope_request", frame_id);
		this.send_command("get_stack_frame_vars", [frame_id]);
	}

	public set_breakpoint(path_to: string, line: number) {
		this.send_command("breakpoint", [path_to, line, true]);
	}

	public set_exception(exception: string) {
		this.exception = exception;
	}

	public set_object_property(
		object_id: bigint,
		label: string,
		new_parsed_value: any
	) {
		this.send_command("scene:set_object_property", [
			object_id,
			label,
			new_parsed_value,
		]);
	}

	public request_stack_dump() {
		this.send_command("get_stack_dump");
	}

	public launch(
		args: LaunchRequestArguments,
		debug_data: GodotDebugData
	) {
		log.info("launch");
		this.debug_data = debug_data;

		const godot_path: string = utils.get_configuration("editorPath.godot4", "godot4");

		log.debug(godot_path);
		const force_visible_collision_shapes = utils.get_configuration("forceVisibleCollisionShapes", false);
		const force_visible_nav_mesh = utils.get_configuration("forceVisibleNavMesh", false);

		let executable_line = `"${godot_path}" --path "${args.project}" --remote-debug "tcp://${args.address}:${args.port}"`;

		if (force_visible_collision_shapes) {
			executable_line += " --debug-collisions";
		}
		if (force_visible_nav_mesh) {
			executable_line += " --debug-navigation";
		}
		// TODO: reimplement this
		// let filename = "";
		// if (args.scene_file) {
		// 	filename = args.scene_file;
		// } else {
		// 	filename = window.activeTextEditor.document.fileName;
		// }
		// executable_line += ` "${filename}"`;

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
					log.debug("data", JSON.stringify(data));
					const command = this.parse_message(data[0]);

					// try {
						this.handle_command(command);
					// } catch {
					// 	//
					// }
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
		const command = new Command();
		command.command = dataset[0];
		command.parameters = dataset[1];
		return command;
	}

	public handle_command(command: Command) {
		// log.debug("handle_command", command.command, JSON.stringify(command.parameters));

		switch (command.command) {
			case "debug_enter": {
				log.debug(command.command, JSON.stringify(command.parameters));
				const reason: string = command.parameters[1];
				if (reason !== "Breakpoint") {
					this.set_exception(reason);
				} else {
					this.set_exception("");
				}
				this.request_stack_dump();
				break;
			}
			case "debug_exit":
				break;
			case "message:click_ctrl ":
				// TODO: what is this?
				break;
			case "scene:scene_tree": {
				log.debug("scene:scene_tree");
				const tree = parse_next(command.parameters, { offset: 0 });
				this.session?.debug_data?.scene_tree?.fill_tree(tree);
				break;
			}
			case "scene:inspect_object": {
				log.debug("scene:inspect_object");
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
				log.debug("stack_dump", JSON.stringify(command.parameters));
				log.debug("wtf 1");
				// const frames: GodotStackFrame[] = command.parameters.map((sf, i) => {
				// 	return {
				// 		id: i,
				// 		file: sf.get("file"),
				// 		line: sf.get("line"),
				// 		function: sf.get("function"),
				// 	};
				// });
				const frames: GodotStackFrame[] = [];

				for (let i = 1; i < command.parameters.length; i += 3) {
					frames.push({
						id: frames.length,
						file: command.parameters[i + 0],
						line: command.parameters[i + 1],
						function: command.parameters[i + 2],
					});
				}

				log.debug("wtf 2");
				this.trigger_breakpoint(frames);
				log.debug("wtf 3");
				this.send_request_scene_tree_command();
				break;
			}
			case "stack_frame_var": {
				log.debug("stack_frame_var", JSON.stringify(command.parameters));
				this.do_stack_frame_var(command.parameters[0], command.parameters[1], command.parameters[2]);
				break;
			}
			case "stack_frame_vars": {
				log.debug("stack_frame_vars", JSON.stringify(command.parameters));
				this.partial_stack_vars.remaining = command.parameters[0];
				this.partial_stack_vars.locals = [];
				this.partial_stack_vars.members = [];
				this.partial_stack_vars.globals = [];
				break;
			}
			case "output": {
				if (!this.first_output) {
					this.first_output = true;
					this.output.show(true);
					this.output.clear();
					this.send_request_scene_tree_command();
				}

				this.output.appendLine(command.parameters[0]);
				break;
			}
		}
	}

	public step() {
		this.send_command("step");
	}

	public step_out() {
		this.stepping_out = true;
		this.send_command("next");
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
		log.debug("trigger_breakpoint");

		let continue_stepping = false;
		const stack_count = stack_frames.length;
		if (stack_count === 0) {
			// Engine code is being executed, no user stack trace
			// TODO: implement me
			// Mediator.notify("stopped_on_breakpoint", [[]]);
			log.debug("stopped: breakpoint 1");
			this.debug_data.last_frames = [];
			this.session?.sendEvent(new StoppedEvent("breakpoint", 0));
			return;
		}

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
		this.debug_data.last_frames = stack_frames;

		if (continue_stepping) {
			this.next();
			return;
		}

		this.stepping_out = false;

		this.debug_data.stack_files = stack_frames.map((sf) => {
			return sf.file;
		});

		if (this.exception.length === 0) {
			log.debug("stopped: breakpoint 2");
			this.session?.sendEvent(new StoppedEvent("breakpoint", 0));
		} else {
			this.session?.set_exception(true);
			log.debug("stopped: exception");
			this.session?.sendEvent(
				new StoppedEvent("exception", 0, this.exception)
			);
		}
	}

	private send_command(command: string, parameters?: any[]) {
		const command_array: any[] = [command, parameters ?? []];
		const buffer = this.encoder.encode_variant(command_array);
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

		log.debug("send_buffer", this.command_buffer.toString());
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

	private do_stack_frame_var(
		name: string,
		type: number, /** 0 = locals, 1 = members, 2 = globals */
		value: any
	) {
		log.debug("do_stack_frame_var", this.partial_stack_vars.remaining);
		if (this.partial_stack_vars.remaining === 0) {
			throw new Error("More stack frame variables were sent than expected.");
		}

		const variable: GodotVariable = {
			name,
			value,
		};
		this.build_sub_values(variable);

		let type_name;
		switch (type) {
			case 0:
				type_name = "locals";
				break;
			case 1:
				type_name = "members";
				break;
			case 2:
				type_name = "globals";
				break;
		}
		this.partial_stack_vars[type_name].push(variable);
		this.partial_stack_vars.remaining--;

		this.session?.set_scopes(this.partial_stack_vars.locals, this.partial_stack_vars.members, this.partial_stack_vars.globals);
		
		// if (this.partial_stack_vars.remaining === 0) {
		// }
	}
}

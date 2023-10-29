import { VariantEncoder } from "./variables/variant_encoder";
import { VariantDecoder } from "./variables/variant_decoder";
import { RawObject } from "./variables/variants";
import {
	GodotBreakpoint,
	GodotStackFrame,
	GodotDebugData,
	GodotVariable,
	GodotStackVars,
} from "../debug_runtime";
import { GodotDebugSession } from "./debug_session";
import { parse_next_scene_node } from "./helpers";
import { debug, window } from "vscode";
import net = require("net");
import { Command } from "../command";
import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import utils = require("../../utils");
import { subProcess, killSubProcesses } from "../../utils/subspawn";
import path = require("path");
import { createLogger } from "../../logger";
import {
	LaunchRequestArguments,
	AttachRequestArguments
} from "./debug_session";

const log = createLogger("debugger.controller");

export class ServerController {
	public session?: GodotDebugSession;
	private command_buffer: Buffer[] = [];
	private debug_data: GodotDebugData;
	private encoder = new VariantEncoder();
	private decoder = new VariantDecoder();
	private draining = false;
	private exception = "";
	private server?: net.Server;
	private socket?: net.Socket;
	private stepping_out = false;
	private current_command: Command = undefined;
	private did_first_output: boolean = false;

	public constructor(session: GodotDebugSession) {
		this.session = session;
	}

	public break() {
		this.send_command("break");
	}

	public continue() {
		this.send_command("continue");
	}

	public next() {
		this.send_command("next");
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.debug_data.remove_breakpoint(path_to, line);
		this.send_command("breakpoint", [path_to, line, false]);
	}

	public request_inspect_object(object_id: bigint) {
		this.send_command("inspect_object", [object_id]);
	}

	public request_scene_tree() {
		this.send_command("request_scene_tree");
	}

	public request_stack_frame_vars(frame_id: number) {
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
		this.send_command("set_object_property", [
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

		const godot_path: string = utils.get_configuration("editorPath.godot3", "godot3");
		const force_visible_collision_shapes = utils.get_configuration("forceVisibleCollisionShapes", false);
		const force_visible_nav_mesh = utils.get_configuration("forceVisibleNavMesh", false);

		let command = `"${godot_path}" --path "${args.project}" --remote-debug "${args.address}:${args.port}"`;

		if (force_visible_collision_shapes) {
			command += " --debug-collisions";
		}
		if (force_visible_nav_mesh) {
			command += " --debug-navigation";
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
			command += " " + args.additional_options;
		}
		command += this.breakpoint_string(
			debug_data.get_all_breakpoints(),
			args.project
		);

		log.debug("executable_line:", command);
		const debugProcess = subProcess("debug", command, { shell: true });

		debugProcess.stdout.on("data", (data) => { });
		debugProcess.stderr.on("data", (data) => { });
		debugProcess.on("close", (code) => { });

		// const godot_exec = cp.exec(executable_line, (error) => {
		// 	if (!this.terminated) {
		// 		window.showErrorMessage(`Failed to launch Godot instance: ${error}`);
		// 	}
		// });

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
				log.debug("socket drain");
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
				log.error("socket error", error);
			});

			socket.on("drain", () => {
				log.debug("socket drain");
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		this.server.listen(args.port, args.address);
	}

	public parse_message(dataset: any[]) {
		if (!this.current_command || this.current_command.complete) {
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
			log.debug("rx:", [this.current_command.command, ...this.current_command.parameters]);
			this.handle_command(this.current_command);
		}
	}

	public handle_command(command: Command) {
		switch (command.command) {
			case "debug_enter": {
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
			case "message:scene_tree": {
				const tree = parse_next_scene_node(command.parameters);
				this.session?.scene_tree.fill_tree(tree);
				break;
			}
			case "message:inspect_object": {
				const id = BigInt(command.parameters[0]);
				const class_name: string = command.parameters[1];
				const properties: any[] = command.parameters[2];

				const raw_object = new RawObject(class_name);
				properties.forEach((prop) => {
					raw_object.set(prop[0], prop[5]);
				});
				const inspected_variable = { name: "", value: raw_object };
				this.build_sub_values(inspected_variable);
				if (this.session?.inspect_callbacks.has(BigInt(id))) {
					this.session?.inspect_callbacks.get(BigInt(id))(
						inspected_variable.name,
						inspected_variable
					);
					this.session?.inspect_callbacks.delete(BigInt(id));
				}
				this.session?.set_inspection(id, inspected_variable);
				break;
			}
			case "stack_dump": {
				const frames: GodotStackFrame[] = command.parameters.map((sf, i) => {
					return {
						id: i,
						file: sf.get("file"),
						function: sf.get("function"),
						line: sf.get("line"),
					};
				});
				this.trigger_breakpoint(frames);
				this.request_scene_tree();
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
				if (!this.did_first_output) {
					this.did_first_output = true;
					// this.request_scene_tree();
				}

				command.parameters.forEach((line) => {
					debug.activeDebugConsole.appendLine(line[0]);
				});
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

		killSubProcesses("debug");
	}

	public trigger_breakpoint(stack_frames: GodotStackFrame[]) {
		log.debug("trigger_breakpoint", stack_frames);

		let continue_stepping = false;
		const stack_count = stack_frames.length;
		if (stack_count === 0) {
			// Engine code is being executed, no user stack trace
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
			this.session?.sendEvent(new StoppedEvent("breakpoint", 0));
		} else {
			this.session?.set_exception(true);
			this.session?.sendEvent(
				new StoppedEvent("exception", 0, this.exception)
			);
		}
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

	private send_command(command: string, parameters?: any[]) {
		const command_array: any[] = [command];
		if (parameters) {
			parameters.forEach((param) => {
				command_array.push(param);
			});
		}
		log.debug("tx:", command_array);
		const buffer = this.encoder.encode_variant(command_array);
		this.command_buffer.push(buffer);
		this.send_buffer();
	}

	private send_buffer() {
		if (!this.socket) {
			return;
		}

		while (!this.draining && this.command_buffer.length > 0) {
			const command = this.command_buffer.shift();
			this.draining = !this.socket.write(command);
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
		console.log("do_stack_frame_vars", locals, members, globals);

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

		this.session?.set_scopes(new GodotStackVars(locals_out, members_out, globals_out));
	}
}

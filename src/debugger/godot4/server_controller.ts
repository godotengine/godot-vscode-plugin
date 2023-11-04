import { VariantEncoder } from "./variables/variant_encoder";
import { VariantDecoder } from "./variables/variant_decoder";
import { RawObject } from "./variables/variants";
import {
	GodotBreakpoint,
	GodotStackFrame,
	GodotVariable,
	GodotStackVars,
} from "../debug_runtime";
import { GodotDebugSession } from "./debug_session";
import { parse_next_scene_node } from "./helpers";
import { debug, window } from "vscode";
import net = require("net");
import { Command } from "../command";
import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import { get_configuration, get_free_port } from "../../utils";
import { subProcess, killSubProcesses } from "../../utils/subspawn";
import path = require("path");
import { createLogger } from "../../logger";
import {
	LaunchRequestArguments,
	AttachRequestArguments
} from "./debug_session";

const log = createLogger("debugger.controller");

export class ServerController {
	private command_buffer: Buffer[] = [];
	private encoder = new VariantEncoder();
	private decoder = new VariantDecoder();
	private draining = false;
	private exception = "";
	private threadId: number;
	private server?: net.Server;
	private socket?: net.Socket;
	private stepping_out = false;
	private did_first_output: boolean = false;
	private partialStackVars = new GodotStackVars();

	public constructor(
		public session: GodotDebugSession
	) { }

	public break() {
		this.send_command("break");
	}

	public continue() {
		this.send_command("continue");
	}

	public next() {
		this.send_command("next");
	}

	public step() {
		this.send_command("step");
	}

	public step_out() {
		this.stepping_out = true;
		this.send_command("next");
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.session.debug_data.remove_breakpoint(path_to, line);
		this.send_command("breakpoint", [path_to, line, false]);
	}

	public request_inspect_object(object_id: bigint) {
		this.send_command("scene:inspect_object", [object_id]);
	}

	public request_scene_tree() {
		this.send_command("scene:request_scene_tree");
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
		this.send_command("scene:set_object_property", [
			object_id,
			label,
			new_parsed_value,
		]);
	}

	public request_stack_dump() {
		this.send_command("get_stack_dump");
	}

	public start_game(args: LaunchRequestArguments) {
		const godot_path: string = get_configuration("editorPath.godot4", "godot4");
		const force_visible_collision_shapes = get_configuration("forceVisibleCollisionShapes", false);
		const force_visible_nav_mesh = get_configuration("forceVisibleNavMesh", false);

		let command = `"${godot_path}" --path "${args.project}" --remote-debug "tcp://${args.address}:${args.port}"`;

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
		// command += ` "${filename}"`;

		if (args.additional_options) {
			command += " " + args.additional_options;
		}
		command += this.breakpoint_string(
			this.session.debug_data.get_all_breakpoints(),
			args.project
		);

		log.debug("command:", command);
		const debugProcess = subProcess("debug", command, { shell: true });

		debugProcess.stdout.on("data", (data) => { });
		debugProcess.stderr.on("data", (data) => { });
		debugProcess.on("close", (code) => { });
	}

	public async launch(args: LaunchRequestArguments) {
		log.info("launch");

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", (buffer) => {
				const buffers = this.split_buffers(buffer);
				while (buffers.length > 0) {
					const sub_buffer = buffers.shift();
					const data = this.decoder.get_dataset(sub_buffer, 0).slice(1);
					log.debug("rx:", data[0]);
					const command = this.parse_message(data[0]);

					this.handle_command(command);
				}
			});

			socket.on("close", (had_error) => {
				log.debug("socket close");
				this.session.sendEvent(new TerminatedEvent());
				this.stop();
			});

			socket.on("end", () => {
				log.debug("socket end");
				this.session.sendEvent(new TerminatedEvent());
				this.stop();
			});

			socket.on("error", (error) => {
				log.debug("socket error");
				// this.session.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("drain", () => {
				log.debug("socket drain");
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		if (args.port === -1) {
			args.port = await get_free_port();
		}

		this.server.listen(args.port, args.address);

		this.start_game(args);
	}

	public async attach(args: AttachRequestArguments) {
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
				// this.session.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("end", () => {
				log.debug("socket end");
				// this.session.sendEvent(new TerminatedEvent());
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
		const command = new Command();
		command.command = dataset[0];
		command.threadId = dataset[1];
		command.parameters = dataset[2];
		return command;
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
			case "message:click_ctrl":
				// TODO: what is this?
				break;
			case "performance:profile_frame":
				// TODO: what is this?
				break;
			case "set_pid":
				this.threadId = command.threadId;
				break;
			case "scene:scene_tree": {
				const tree = parse_next_scene_node(command.parameters);
				this.session.scene_tree.fill_tree(tree);
				break;
			}
			case "scene:inspect_object": {
				const id = BigInt(command.parameters[0]);
				const className: string = command.parameters[1];
				const properties: any[] = command.parameters[2];

				const rawObject = new RawObject(className);
				properties.forEach((prop) => {
					rawObject.set(prop[0], prop[5]);
				});
				const inspected_variable = { name: "", value: rawObject };
				this.build_sub_values(inspected_variable);
				if (this.session.inspect_callbacks.has(BigInt(id))) {
					this.session.inspect_callbacks.get(BigInt(id))(
						inspected_variable.name,
						inspected_variable
					);
					this.session.inspect_callbacks.delete(BigInt(id));
				}
				this.session.set_inspection(id, inspected_variable);
				break;
			}
			case "stack_dump": {
				const frames: GodotStackFrame[] = [];

				for (let i = 1; i < command.parameters.length; i += 3) {
					frames.push({
						id: frames.length,
						file: command.parameters[i + 0],
						line: command.parameters[i + 1],
						function: command.parameters[i + 2],
					});
				}

				this.trigger_breakpoint(frames);
				this.request_scene_tree();
				break;
			}
			case "stack_frame_vars": {
				this.partialStackVars.reset(command.parameters[0]);
				this.session.set_scopes(this.partialStackVars);
				break;
			}
			case "stack_frame_var": {
				this.do_stack_frame_var(
					command.parameters[0],
					command.parameters[1],
					command.parameters[2],
					command.parameters[3],
				);
				break;
			}
			case "output": {
				if (!this.did_first_output) {
					this.did_first_output = true;
					this.request_scene_tree();
				}

				debug.activeDebugConsole.appendLine(command.parameters[0]);
				break;
			}
		}
	}

	public stop() {
		log.debug("stop");
		killSubProcesses("debug");

		this.socket?.destroy();
		this.server?.close((error) => {
			if (error) {
				log.error(error);
			}
			this.server.unref();
			this.server = undefined;
		});
	}

	public trigger_breakpoint(stack_frames: GodotStackFrame[]) {
		log.debug("trigger_breakpoint", stack_frames);

		let continue_stepping = false;
		const stack_count = stack_frames.length;
		if (stack_count === 0) {
			// Engine code is being executed, no user stack trace
			this.session.debug_data.last_frames = [];
			this.session.sendEvent(new StoppedEvent("breakpoint", 0));
			return;
		}

		const file = stack_frames[0].file.replace(
			"res://",
			`${this.session.debug_data.project_path}/`
		);
		const line = stack_frames[0].line;

		if (this.stepping_out) {
			const breakpoint = this.session.debug_data
				.get_breakpoints(file)
				.find((bp) => bp.line === line);
			if (!breakpoint) {
				if (this.session.debug_data.stack_count > 1) {
					continue_stepping = this.session.debug_data.stack_count === stack_count;
				} else {
					const file_same =
						stack_frames[0].file === this.session.debug_data.last_frame.file;
					const func_same =
						stack_frames[0].function === this.session.debug_data.last_frame.function;
					const line_greater =
						stack_frames[0].line >= this.session.debug_data.last_frame.line;

					continue_stepping = file_same && func_same && line_greater;
				}
			}
		}

		this.session.debug_data.stack_count = stack_count;
		this.session.debug_data.last_frame = stack_frames[0];
		this.session.debug_data.last_frames = stack_frames;

		if (continue_stepping) {
			this.next();
			return;
		}

		this.stepping_out = false;

		this.session.debug_data.stack_files = stack_frames.map((sf) => {
			return sf.file;
		});

		if (this.exception.length === 0) {
			this.session.sendEvent(new StoppedEvent("breakpoint", 0));
		} else {
			this.session.set_exception(true);
			this.session.sendEvent(
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
		const command_array: any[] = [command, this.threadId, parameters ?? []];
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

	private do_stack_frame_var(
		name: string,
		scope: 0 | 1 | 2, // 0 = locals, 1 = members, 2 = globals
		type: bigint,
		value: any,
	) {
		log.debug("do_stack_frame_var", name, scope, value);

		if (this.partialStackVars.remaining === 0) {
			throw new Error("More stack frame variables were sent than expected.");
		}

		const variable: GodotVariable = { name, value, type };
		this.build_sub_values(variable);

		const scopeName = ["locals", "members", "globals"][scope];
		this.partialStackVars[scopeName].push(variable);
		this.partialStackVars.remaining--;

		if (this.partialStackVars.remaining === 0) {
			this.session.set_scopes(this.partialStackVars);
		}
	}
}

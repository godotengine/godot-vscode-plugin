import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as fs from "node:fs";
import * as net from "node:net";
import { debug, window } from "vscode";

import {
	ansi,
	convert_resource_path_to_uri,
	createLogger,
	get_configuration,
	get_free_port,
	get_project_version,
	verify_godot_version,
	VERIFY_RESULT,
} from "../../utils";
import { prompt_for_godot_executable } from "../../utils/prompts";
import { killSubProcesses, subProcess } from "../../utils/subspawn";
import { GodotStackFrame, GodotStackVars } from "../debug_runtime";
import { AttachRequestArguments, LaunchRequestArguments, pinnedScene } from "../debugger";
import { GodotDebugSession } from "./debug_session";
import { build_sub_values, parse_next_scene_node, split_buffers } from "./helpers";
import { VariantDecoder } from "./variables/variant_decoder";
import { VariantEncoder } from "./variables/variant_encoder";
import { RawObject } from "./variables/variants";
import BBCodeToAnsi from "bbcode-to-ansi";

const log = createLogger("debugger.controller", { output: "Godot Debugger" });
const socketLog = createLogger("debugger.socket");
//initialize bbcodeParser and set default output color to grey
const bbcodeParser = new BBCodeToAnsi("\u001b[38;2;211;211;211m");

class Command {
	public command = "";
	public paramCount = -1;
	public parameters: any[] = [];
	public complete = false;
	public threadId = 0;
}

export class ServerController {
	private commandBuffer: Buffer[] = [];
	private encoder = new VariantEncoder();
	private decoder = new VariantDecoder();
	private draining = false;
	private exception = "";
	private server?: net.Server;
	private socket?: net.Socket;
	private steppingOut = false;
	private currentCommand: Command = undefined;
	private didFirstOutput = false;
	private connectedVersion = "";

	public constructor(public session: GodotDebugSession) {}

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
		this.steppingOut = true;
		this.send_command("next");
	}

	public set_breakpoint(path_to: string, line: number) {
		this.send_command("breakpoint", [path_to, line, true]);
	}

	public remove_breakpoint(path_to: string, line: number) {
		this.session.debug_data.remove_breakpoint(path_to, line);
		this.send_command("breakpoint", [path_to, line, false]);
	}

	public request_inspect_object(object_id: bigint) {
		this.send_command("inspect_object", [object_id]);
	}

	public request_scene_tree() {
		this.send_command("request_scene_tree");
	}

	public request_stack_dump() {
		this.send_command("get_stack_dump");
	}

	public request_stack_frame_vars(frame_id: number) {
		this.send_command("get_stack_frame_vars", [frame_id]);
	}

	public set_object_property(objectId: bigint, label: string, newParsedValue) {
		this.send_command("set_object_property", [objectId, label, newParsedValue]);
	}

	public set_exception(exception: string) {
		this.exception = exception;
	}

	private async start_game(args: LaunchRequestArguments) {
		log.info("Starting game process");

		let godotPath: string;
		let result: VERIFY_RESULT;
		if (args.editor_path) {
			log.info("Using 'editor_path' variable from launch.json");

			log.info(`Verifying version of '${args.editor_path}'`);
			result = verify_godot_version(args.editor_path, "3");
			godotPath = result.godotPath;
			log.info(`Verification result: ${result.status}, version: "${result.version}"`);

			switch (result.status) {
				case "WRONG_VERSION": {
					const projectVersion = await get_project_version();
					const message = `Cannot launch debug session: The current project uses Godot v${projectVersion}, but the specified Godot executable is v${result.version}`;
					log.warn(message);
					window.showErrorMessage(message, "Ok");
					this.abort();
					return;
				}
				case "INVALID_EXE": {
					const message = `Cannot launch debug session: '${godotPath}' is not a valid Godot executable`;
					log.warn(message);
					window.showErrorMessage(message, "Ok");
					this.abort();
					return;
				}
				default: {
					break;
				}
			}
		} else {
			log.info("Using 'editorPath.godot3' from settings");

			const settingName = "editorPath.godot3";
			godotPath = get_configuration(settingName);

			log.info(`Verifying version of '${godotPath}'`);
			result = verify_godot_version(godotPath, "3");
			godotPath = result.godotPath;
			log.info(`Verification result: ${result.status}, version: "${result.version}"`);

			switch (result.status) {
				case "WRONG_VERSION": {
					const projectVersion = await get_project_version();
					const message = `Cannot launch debug session: The current project uses Godot v${projectVersion}, but the specified Godot executable is v${result.version}`;
					log.warn(message);
					prompt_for_godot_executable(message, settingName);
					this.abort();
					return;
				}
				case "INVALID_EXE": {
					const message = `Cannot launch debug session: '${godotPath}' is not a valid Godot executable`;
					log.warn(message);
					prompt_for_godot_executable(message, settingName);
					this.abort();
					return;
				}
			}
		}

		this.connectedVersion = result.version;

		let command = `"${godotPath}" --path "${args.project}"`;
		const address = args.address.replace("tcp://", "");
		command += ` --remote-debug "${address}:${args.port}"`;

		if (args.profiling) command += " --profiling";
		if (args.debug_collisions) command += " --debug-collisions";
		if (args.debug_paths) command += " --debug-paths";
		if (args.frame_delay) command += ` --frame-delay ${args.frame_delay}`;
		if (args.time_scale) command += ` --time-scale ${args.time_scale}`;
		if (args.fixed_fps) command += ` --fixed-fps ${args.fixed_fps}`;

		if (args.scene && args.scene !== "main") {
			log.info(`Custom scene argument provided: ${args.scene}`);
			let filename = args.scene;
			if (args.scene === "current") {
				let path = window.activeTextEditor.document.fileName;
				if (path.endsWith(".gd")) {
					path = path.replace(".gd", ".tscn");
					if (!fs.existsSync(path)) {
						const message = `Can't find associated scene file for ${path}`;
						log.warn(message);
						window.showErrorMessage(message, "Ok");
						this.abort();
						return;
					}
				}
				filename = path;
			}
			if (args.scene === "pinned") {
				if (!pinnedScene) {
					const message = "No pinned scene found";
					log.warn(message);
					window.showErrorMessage(message, "Ok");
					this.abort();
					return;
				}
				let path = pinnedScene.fsPath;
				if (path.endsWith(".gd")) {
					path = path.replace(".gd", ".tscn");
					if (!fs.existsSync(path)) {
						const message = `Can't find associated scene file for ${path}`;
						log.warn(message);
						window.showErrorMessage(message, "Ok");
						this.abort();
						return;
					}
				}
				filename = path;
			}
			command += ` "${filename}"`;
		}

		command += this.session.debug_data.get_breakpoint_string();

		if (args.additional_options) {
			command += ` ${args.additional_options}`;
		}

		log.info(`Launching game process using command: '${command}'`);
		const debugProcess = subProcess("debug", command, { shell: true, detached: true });

		debugProcess.stdout.on("data", (data) => {});
		debugProcess.stderr.on("data", (data) => {});
		debugProcess.on("close", (code) => {});
	}

	private stash: Buffer;

	private on_data(buffer: Buffer) {
		if (this.stash) {
			buffer = Buffer.concat([this.stash, buffer]);
			this.stash = undefined;
		}

		const buffers = split_buffers(buffer);
		while (buffers.length > 0) {
			const chunk = buffers.shift();
			const data = this.decoder.get_dataset(chunk)?.slice(1);
			if (data === undefined) {
				this.stash = Buffer.alloc(chunk.length);
				chunk.copy(this.stash);
				return;
			}
			this.parse_message(data);
		}
	}

	public async launch(args: LaunchRequestArguments) {
		log.info("Starting debug controller in 'launch' mode");

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", this.on_data.bind(this));

			socket.on("close", (had_error) => {
				// log.debug("socket close");
				this.abort();
			});

			socket.on("end", () => {
				// log.debug("socket end");
				this.abort();
			});

			socket.on("error", (error) => {
				// log.debug("socket error");
				// this.session.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("drain", () => {
				// log.debug("socket drain");
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
		log.info("Starting debug controller in 'attach' mode");

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", this.on_data.bind(this));

			socket.on("close", (had_error) => {
				// log.debug("socket close");
				// this.session.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("end", () => {
				// log.debug("socket end");
				// this.session.sendEvent(new TerminatedEvent());
				// this.stop();
			});

			socket.on("error", (error) => {
				// log.error("socket error", error);
			});

			socket.on("drain", () => {
				// log.debug("socket drain");
				socket.resume();
				this.draining = false;
				this.send_buffer();
			});
		});

		this.server.listen(args.port, args.address);
	}

	private parse_message(dataset: any[]) {
		if (!this.currentCommand || this.currentCommand.complete) {
			this.currentCommand = new Command();
			this.currentCommand.command = dataset.shift();
		}

		while (dataset && dataset.length > 0) {
			if (this.currentCommand.paramCount === -1) {
				this.currentCommand.paramCount = dataset.shift();
			} else {
				this.currentCommand.parameters.push(dataset.shift());
			}

			if (this.currentCommand.paramCount === this.currentCommand.parameters.length) {
				this.currentCommand.complete = true;
			}
		}

		if (this.currentCommand.complete) {
			socketLog.debug("rx:", [this.currentCommand.command, ...this.currentCommand.parameters]);
			this.handle_command(this.currentCommand);
		}
	}

	private async handle_command(command: Command) {
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
			case "performance":
				// TODO: what is this?
				break;
			case "message:scene_tree": {
				const tree = parse_next_scene_node(command.parameters);
				this.session.sceneTree.fill_tree(tree);
				break;
			}
			case "message:inspect_object": {
				let id = BigInt(command.parameters[0]);
				const className: string = command.parameters[1];
				const properties: string[] = command.parameters[2];

				// message:inspect_object returns the id as an unsigned 64 bit integer, but it is decoded as a signed 64 bit integer,
				// thus we need to convert it to its equivalent unsigned value here.
				if (id < 0) {
					id = id + BigInt(2) ** BigInt(64);
				}

				const rawObject = new RawObject(className);
				for (const prop of properties) {
					rawObject.set(prop[0], prop[5]);
				}
				const inspectedVariable = { name: "", value: rawObject };
				build_sub_values(inspectedVariable);
				if (this.session.inspect_callbacks.has(BigInt(id))) {
					this.session.inspect_callbacks.get(BigInt(id))(inspectedVariable.name, inspectedVariable);
					this.session.inspect_callbacks.delete(BigInt(id));
				}
				this.session.set_inspection(id, inspectedVariable);
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
				this.do_stack_frame_vars(command.parameters);
				break;
			}
			case "output": {
				if (!this.didFirstOutput) {
					this.didFirstOutput = true;
					// this.request_scene_tree();
				}
				for (const output of command.parameters) {
					for (const line of output[0].split("\n")) {
						debug.activeDebugConsole.appendLine(bbcodeParser.parse(line));
					}
				}
				break;
			}
			case "error": {
				if (!this.didFirstOutput) {
					this.didFirstOutput = true;
				}
				this.handle_error(command);
				break;
			}
		}
	}

	async handle_error(command: Command) {
		const params = command.parameters[0];
		const e = {
			hr: params[0],
			min: params[1],
			sec: params[2],
			msec: params[3],
			func: params[4] as string,
			file: params[5] as string,
			line: params[6],
			cond: params[7] as string,
			msg: params[8] as string,
			warning: params[9] as boolean,
			stack: [],
		};
		const stackCount = command.parameters[1];
		for (let i = 0; i < stackCount; i += 3) {
			const file = command.parameters[i + 2];
			const func = command.parameters[i + 3];
			const line = command.parameters[i + 4];
			const msg = `${file}:${line} @ ${func}()`;
			const extras = {
				source: { name: (await convert_resource_path_to_uri(file)).toString() },
				line: line,
			};
			e.stack.push({ msg: msg, extras: extras });
		}

		const time = `${e.hr}:${e.min}:${e.sec}.${e.msec}`;
		const location = `${e.file}:${e.line} @ ${e.func}()`;
		const color = e.warning ? "yellow" : "red";
		const lang = e.file.startsWith("res://") ? "GDScript" : "C++";

		const extras = {
			source: { name: (await convert_resource_path_to_uri(e.file)).toString() },
			line: e.line,
			group: "startCollapsed",
		};
		if (e.msg) {
			this.stderr(`${ansi[color]}${time} | ${e.func}: ${e.msg}`, extras);
			this.stderr(`${ansi.dim.white}<${lang} Error> ${ansi.white}${e.cond}`);
		} else {
			this.stderr(`${ansi[color]}${time} | ${e.func}: ${e.cond}`, extras);
		}
		this.stderr(`${ansi.dim.white}<${lang} Source> ${ansi.white}${location}`);

		if (stackCount !== 0) {
			this.stderr(`${ansi.dim.white}<Stack Trace>`, { group: "start" });
			for (const frame of e.stack) {
				this.stderr(`${ansi.white}${frame.msg}`, frame.extras);
			}
			this.stderr("", { group: "end" });
		}
		this.stderr("", { group: "end" });
	}

	stdout(output = "", extra = {}) {
		this.session.sendEvent({
			event: "output",
			body: {
				category: "stdout",
				output: output + ansi.reset,
				...extra,
			},
		} as DebugProtocol.OutputEvent);
	}

	stderr(output = "", extra = {}) {
		this.session.sendEvent({
			event: "output",
			body: {
				category: "stderr",
				output: output + ansi.reset,
				...extra,
			},
		} as DebugProtocol.OutputEvent);
	}

	public abort() {
		log.info("Aborting debug controller");
		this.session.sendEvent(new TerminatedEvent());
		this.stop();
	}

	public stop() {
		log.info("Stopping debug controller");
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

	public trigger_breakpoint(stackFrames: GodotStackFrame[]) {
		let continueStepping = false;
		const stackCount = stackFrames.length;
		if (stackCount === 0) {
			// Engine code is being executed, no user stack trace
			this.session.debug_data.last_frames = [];
			this.session.sendEvent(new StoppedEvent("breakpoint", 0));
			return;
		}

		const file = stackFrames[0].file.replace("res://", `${this.session.debug_data.projectPath}/`);
		const line = stackFrames[0].line;

		if (this.steppingOut) {
			const breakpoint = this.session.debug_data.get_breakpoints(file).find((bp) => bp.line === line);
			if (!breakpoint) {
				if (this.session.debug_data.stack_count > 1) {
					continueStepping = this.session.debug_data.stack_count === stackCount;
				} else {
					const fileSame = stackFrames[0].file === this.session.debug_data.last_frame.file;
					const funcSame = stackFrames[0].function === this.session.debug_data.last_frame.function;
					const lineGreater = stackFrames[0].line >= this.session.debug_data.last_frame.line;

					continueStepping = fileSame && funcSame && lineGreater;
				}
			}
		}

		this.session.debug_data.stack_count = stackCount;
		this.session.debug_data.last_frame = stackFrames[0];
		this.session.debug_data.last_frames = stackFrames;

		if (continueStepping) {
			this.next();
			return;
		}

		this.steppingOut = false;

		this.session.debug_data.stack_files = stackFrames.map((sf) => {
			return sf.file;
		});

		if (this.exception.length === 0) {
			this.session.sendEvent(new StoppedEvent("breakpoint", 0));
		} else {
			this.session.sendEvent(new StoppedEvent("exception", 0, this.exception));
		}
	}

	private send_command(command: string, parameters: any[] = []) {
		const commandArray: any[] = [command, ...parameters];
		socketLog.debug("tx:", commandArray);
		const buffer = this.encoder.encode_variant(commandArray);
		this.commandBuffer.push(buffer);
		this.send_buffer();
	}

	private send_buffer() {
		if (!this.socket) {
			return;
		}

		while (!this.draining && this.commandBuffer.length > 0) {
			const command = this.commandBuffer.shift();
			this.draining = !this.socket.write(command);
		}
	}

	private do_stack_frame_vars(parameters: any[]) {
		const stackVars = new GodotStackVars();

		let localsRemaining = parameters[0];
		let membersRemaining = parameters[1 + localsRemaining * 2];
		let globalsRemaining = parameters[2 + (localsRemaining + membersRemaining) * 2];

		let i = 1;
		while (localsRemaining--) {
			stackVars.locals.push({ name: parameters[i++], value: parameters[i++] });
		}
		i++;
		while (membersRemaining--) {
			stackVars.members.push({ name: parameters[i++], value: parameters[i++] });
		}
		i++;
		while (globalsRemaining--) {
			stackVars.globals.push({ name: parameters[i++], value: parameters[i++] });
		}

		// biome-ignore lint/complexity/noForEach: <custom forEach impl>
		stackVars.forEach((item) => build_sub_values(item));

		this.session.set_scopes(stackVars);
	}
}

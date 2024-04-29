import * as fs from "fs";
import net = require("net");
import { debug, window } from "vscode";
import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import { VariantEncoder } from "./variables/variant_encoder";
import { VariantDecoder } from "./variables/variant_decoder";
import { RawObject } from "./variables/variants";
import { GodotStackFrame, GodotVariable, GodotStackVars } from "../debug_runtime";
import { GodotDebugSession } from "./debug_session";
import { parse_next_scene_node, split_buffers, build_sub_values } from "./helpers";
import { get_configuration, get_free_port, createLogger, verify_godot_version, get_project_version, clean_godot_path } from "../../utils";
import { prompt_for_godot_executable } from "../../utils/prompts";
import { subProcess, killSubProcesses } from "../../utils/subspawn";
import { LaunchRequestArguments, AttachRequestArguments, pinnedScene } from "../debugger";

const log = createLogger("debugger.controller", { output: "Godot Debugger" });
const socketLog = createLogger("debugger.socket");

class Command {
	public command: string = "";
	public paramCount: number = -1;
	public parameters: any[] = [];
	public complete: boolean = false;
	public threadId: number = 0;
}

export class ServerController {
	private commandBuffer: Buffer[] = [];
	private encoder = new VariantEncoder();
	private decoder = new VariantDecoder();
	private draining = false;
	private exception = "";
	private threadId: number;
	private server?: net.Server;
	private socket?: net.Socket;
	private steppingOut = false;
	private didFirstOutput: boolean = false;
	private partialStackVars = new GodotStackVars();
	private connectedVersion = "";

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
		this.send_command("scene:inspect_object", [object_id]);
	}

	public request_scene_tree() {
		this.send_command("scene:request_scene_tree");
	}

	public request_stack_dump() {
		this.send_command("get_stack_dump");
	}

	public request_stack_frame_vars(frame_id: number) {
		this.send_command("get_stack_frame_vars", [frame_id]);
	}

	public set_object_property(objectId: bigint, label: string, newParsedValue: any) {
		this.send_command("scene:set_object_property", [
			objectId,
			label,
			newParsedValue,
		]);
	}

	public set_exception(exception: string) {
		this.exception = exception;
	}

	private async start_game(args: LaunchRequestArguments) {
		log.info("Starting game process");

		let godotPath: string;
		let result;
		if (args.editor_path) {
			log.info("Using 'editor_path' variable from launch.json");

			godotPath = clean_godot_path(args.editor_path);

			log.info(`Verifying version of '${godotPath}'`);
			result = verify_godot_version(godotPath, "4");

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
			}
		} else {
			log.info("Using 'editorPath.godot4' from settings");

			const settingName = "editorPath.godot4";
			godotPath = clean_godot_path(get_configuration(settingName));

			log.info(`Verifying version of '${godotPath}'`);
			result = verify_godot_version(godotPath, "4");

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
		command += ` --remote-debug "tcp://${address}:${args.port}"`;

		if (args.profiling) { command += " --profiling"; }
		if (args.single_threaded_scene) { command += " --single-threaded-scene"; }
		if (args.debug_collisions) { command += " --debug-collisions"; }
		if (args.debug_paths) { command += " --debug-paths"; }
		if (args.debug_navigation) { command += " --debug-navigation"; }
		if (args.debug_avoidance) { command += " --debug-avoidance"; }
		if (args.debug_stringnames) { command += " --debug-stringnames"; }
		if (args.frame_delay) { command += ` --frame-delay ${args.frame_delay}`; }
		if (args.time_scale) { command += ` --time-scale ${args.time_scale}`; }
		if (args.disable_vsync) { command += " --disable-vsync"; }
		if (args.fixed_fps) { command += ` --fixed-fps ${args.fixed_fps}`; }

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
			command += " " + args.additional_options;
		}

		log.info(`Launching game process using command: '${command}'`);
		const debugProcess = subProcess("debug", command, { shell: true, detached: true });

		debugProcess.stdout.on("data", (data) => { });
		debugProcess.stderr.on("data", (data) => { });
		debugProcess.on("close", (code) => { });
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

			socketLog.debug("rx:", data[0]);
			const command = this.parse_message(data[0]);
			this.handle_command(command);
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
		const command = new Command();
		let i = 0;
		command.command = dataset[i++];
		if (this.connectedVersion[2] >= "2") {
			command.threadId = dataset[i++];
		}
		command.parameters = dataset[i++];
		return command;
	}

	private handle_command(command: Command) {
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
				this.session.sceneTree.fill_tree(tree);
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
				const inspectedVariable = { name: "", value: rawObject };
				build_sub_values(inspectedVariable);
				if (this.session.inspect_callbacks.has(BigInt(id))) {
					this.session.inspect_callbacks.get(BigInt(id))(
						inspectedVariable.name,
						inspectedVariable
					);
					this.session.inspect_callbacks.delete(BigInt(id));
				}
				this.session.set_inspection(id, inspectedVariable);
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
				if (!this.didFirstOutput) {
					this.didFirstOutput = true;
					// this.request_scene_tree();
				}
				const lines = command.parameters[0];
				for (const line of lines) {
					debug.activeDebugConsole.appendLine(line);
				}
				break;
			}
		}
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
			const breakpoint = this.session.debug_data
				.get_breakpoints(file)
				.find((bp) => bp.line === line);
			if (!breakpoint) {
				if (this.session.debug_data.stack_count > 1) {
					continueStepping = this.session.debug_data.stack_count === stackCount;
				} else {
					const fileSame =
						stackFrames[0].file === this.session.debug_data.last_frame.file;
					const funcSame =
						stackFrames[0].function === this.session.debug_data.last_frame.function;
					const lineGreater =
						stackFrames[0].line >= this.session.debug_data.last_frame.line;

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
			this.session.set_exception(true);
			this.session.sendEvent(
				new StoppedEvent("exception", 0, this.exception)
			);
		}
	}

	private send_command(command: string, parameters?: any[]) {
		const commandArray: any[] = [command];
		// log.debug("send_command", this.connectedVersion);
		if (this.connectedVersion[2] >= "2") {
			commandArray.push(this.threadId);
		}
		commandArray.push(parameters ?? []);
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

	private do_stack_frame_var(
		name: string,
		scope: 0 | 1 | 2, // 0 = locals, 1 = members, 2 = globals
		type: bigint,
		value: any,
	) {
		if (this.partialStackVars.remaining === 0) {
			throw new Error("More stack frame variables were sent than expected.");
		}

		const variable: GodotVariable = { name, value, type };
		build_sub_values(variable);

		const scopeName = ["locals", "members", "globals"][scope];
		this.partialStackVars[scopeName].push(variable);
		this.partialStackVars.remaining--;

		if (this.partialStackVars.remaining === 0) {
			this.session.set_scopes(this.partialStackVars);
		}
	}
}

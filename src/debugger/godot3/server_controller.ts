import * as fs from "fs";
import { VariantEncoder } from "./variables/variant_encoder";
import { VariantDecoder } from "./variables/variant_decoder";
import { RawObject } from "./variables/variants";
import {
	GodotStackFrame,
	GodotVariable,
	GodotStackVars,
	get_breakpoint_string,
} from "../debug_runtime";
import { GodotDebugSession } from "./debug_session";
import { build_sub_values, parse_next_scene_node, split_buffers } from "./helpers";
import { Uri, debug, window } from "vscode";
import net = require("net");
import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import { get_configuration, get_free_port, projectVersion, set_configuration } from "../../utils";
import { subProcess, killSubProcesses } from "../../utils/subspawn";
import { execSync } from "child_process";
import { LaunchRequestArguments, AttachRequestArguments, pinnedScene } from "../debugger";
import { createLogger } from "../../logger";

const log = createLogger("debugger.controller");

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
	private server?: net.Server;
	private socket?: net.Socket;
	private steppingOut = false;
	private currentCommand: Command = undefined;
	private didFirstOutput: boolean = false;

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

	public set_object_property(objectId: bigint, label: string, newParsedValue: any) {
		this.send_command("set_object_property", [
			objectId,
			label,
			newParsedValue,
		]);
	}

	public set_exception(exception: string) {
		this.exception = exception;
	}

	private async select_godot_executable(settingName: string) {
		window.showOpenDialog({
			openLabel: "Select Godot executable",
			filters: process.platform === "win32" ? { "Godot Editor Binary": ["exe", "EXE"] } : undefined
		}).then(async (uris: Uri[]) => {
			if (!uris) {
				return;
			}
			const path = uris[0].fsPath;
			set_configuration(settingName, path);
		});
	}

	private start_game(args: LaunchRequestArguments) {
		const settingName = "editorPath.godot3";
		const godotPath: string = get_configuration(settingName);

		try {
			const output = execSync(`${godotPath} --version`).toString().trim();
			const pattern = /([34])\.([0-9]+)\.(?:[0-9]+\.)?\w+.\w+.[0-9a-f]{9}/;
			const match = output.match(pattern);
			if (!match) {
				const message = `Cannot launch debug session: '${settingName}' of '${godotPath}' is not a valid Godot executable`;
				window.showErrorMessage(message, "Select Godot executable", "Ignore").then(item => {
					if (item == "Select Godot executable") {
						this.select_godot_executable(settingName);
					}
				});
				this.abort();
				return;
			}
			if (match[1] !== settingName.slice(-1)) {
				const message = `Cannot launch debug session: The current project uses Godot v${projectVersion}, but the specified Godot executable is version ${match[0]}`;
				window.showErrorMessage(message, "Select Godot executable", "Ignore").then(item => {
					if (item == "Select Godot executable") {
						this.select_godot_executable(settingName);
					}
				});
				this.abort();
				return;
			}
		} catch {
			const message = `Cannot launch debug session: ${settingName} of ${godotPath} is not a valid Godot executable`;
			window.showErrorMessage(message, "Select Godot executable", "Ignore").then(item => {
				if (item == "Select Godot executable") {
					this.select_godot_executable(settingName);
				}
			});
			this.abort();
			return;
		}

		let command = `"${godotPath}" --path "${args.project}"`;

		command += ` --remote-debug "tcp://${args.address.replace("tcp://", "")}:${args.port}"`;

		if (get_configuration("forceVisibleCollisionShapes")) {
			command += " --debug-collisions";
		}
		if (get_configuration("forceVisibleNavMesh")) {
			command += " --debug-navigation";
		}

		if (args.scene && args.scene !== "main") {
			let filename = args.scene;
			if (args.scene === "current") {
				let path = window.activeTextEditor.document.fileName;
				if (path.endsWith(".gd")) {
					path = path.replace(".gd", ".tscn");
					if (!fs.existsSync(path)) {
						window.showErrorMessage(`Can't find associated scene file for ${path}`, "Ok");
						this.abort();
						return;
					}
				}
				filename = path;
			}
			if (args.scene === "pinned") {
				if (pinnedScene) {
					filename = pinnedScene.fsPath;
					window.showErrorMessage("No pinned scene found", "Ok");
					this.abort();
					return;
				}
			}
			command += ` "${filename}"`;
		}

		command += this.session.debug_data.get_breakpoint_string(args.project);

		if (args.additional_options) {
			command += " " + args.additional_options;
		}

		log.info("command:", command);
		const debugProcess = subProcess("debug", command, { shell: true });

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
			this.parse_message(data);
		}
	}

	public async launch(args: LaunchRequestArguments) {
		log.info("launch");

		this.server = net.createServer((socket) => {
			this.socket = socket;

			socket.on("data", this.on_data.bind(this));

			socket.on("close", (had_error) => {
				log.debug("socket close");
				this.abort();
			});

			socket.on("end", () => {
				log.debug("socket end");
				this.abort();
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

			socket.on("data", this.on_data.bind(this));

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
			log.debug("rx:", [this.currentCommand.command, ...this.currentCommand.parameters]);
			this.handle_command(this.currentCommand);
		}
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
			case "message:click_ctrl ":
				// TODO: what is this?
				break;
			case "message:scene_tree": {
				const tree = parse_next_scene_node(command.parameters);
				this.session.sceneTree.fill_tree(tree);
				break;
			}
			case "message:inspect_object": {
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

				command.parameters.forEach((line) => {
					debug.activeDebugConsole.appendLine(line[0]);
				});
				break;
			}
		}
	}

	public abort() {
		this.session.sendEvent(new TerminatedEvent());
		this.stop();
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

	public trigger_breakpoint(stackFrames: GodotStackFrame[]) {
		log.debug("trigger_breakpoint", stackFrames);

		let continueStepping = false;
		const stackCount = stackFrames.length;
		if (stackCount === 0) {
			// Engine code is being executed, no user stack trace
			this.session.debug_data.last_frames = [];
			this.session.sendEvent(new StoppedEvent("breakpoint", 0));
			return;
		}

		const file = stackFrames[0].file.replace(
			"res://",
			`${this.session.debug_data.project_path}/`
		);
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

	private send_command(command: string, parameters: any[] = []) {
		const commandArray: any[] = [command, ...parameters];
		log.debug("tx:", commandArray);
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
		log.debug("do_stack_frame_vars", parameters);

		const stackVars = new GodotStackVars();

		let localsRemaining = parameters[0];
		let membersRemaining = parameters[1 + (localsRemaining * 2)];
		let globalsRemaining = parameters[2 + ((localsRemaining + membersRemaining) * 2)];

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

		stackVars.forEach(item => build_sub_values(item));

		this.session.set_scopes(stackVars);
	}
}

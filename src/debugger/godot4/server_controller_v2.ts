import { StoppedEvent, TerminatedEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as fs from "node:fs";
import * as net from "node:net";
import { debug, window } from "vscode";
import BBCodeToAnsi from "bbcode-to-ansi";

import { ansi, convert_resource_path_to_uri, createLogger, get_configuration, get_free_port, get_project_version, verify_godot_version, VERIFY_RESULT } from "../../utils";
import { prompt_for_godot_executable } from "../../utils/prompts";
import { killSubProcesses, subProcess } from "../../utils/subspawn";
import { LaunchRequestArguments, AttachRequestArguments, pinnedScene } from "../debugger";
import { parse_next_scene_node } from "./helpers";
import { DebugChannelV2, DebugEnvelopeV2, DebugPacketStreamV2, encodeEnvelopeV2 } from "./protocol_v2";
import { DebugChannelPairerV2, DebugSessionStateV2, ExecutionCommandV2 } from "./session_state_v2";
import type { GodotDebugSessionV2 } from "./debug_session_v2";

const log = createLogger("debugger.controller.v2", { output: "Godot Debugger" });
const socketLog = createLogger("debugger.socket.v2");
const bbcodeParser = new BBCodeToAnsi("\u001b[38;2;211;211;211m");
const traceEnabled = process.env.GODOT_V2_TRACE === "1";

interface SocketContextV2 {
	socket: net.Socket;
	stream: DebugPacketStreamV2;
	hello?: DebugEnvelopeV2;
}

interface PendingControlV2 {
	command: ExecutionCommandV2;
	started: number;
	resolve: (latencyMs: number) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

interface PendingDataV2 {
	resolve: (message: DebugEnvelopeV2) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
	cleanup: () => void;
}

export class ServerController {
	private server?: net.Server;
	private controlSocket?: net.Socket;
	private dataSocket?: net.Socket;
	private contexts = new Map<net.Socket, SocketContextV2>();
	private pairer = new DebugChannelPairerV2();
	private state = new DebugSessionStateV2();
	private pendingControl = new Map<bigint, PendingControlV2>();
	private pendingData = new Map<bigint, PendingDataV2>();
	private heartbeat?: NodeJS.Timeout;
	private stopping = false;

	public constructor(public session: GodotDebugSessionV2) {}

	public get currentStopId() { return this.state.stopId; }
	public get isPaused() { return this.state.paused; }

	public break() { return this.execute("pause"); }
	public continue() { return this.execute("continue"); }
	public next() { return this.execute("next"); }
	public step() { return this.execute("step"); }
	public step_out() { return this.execute("step_out"); }

	public set_breakpoint(path: string, line: number) {
		void this.requestData("breakpoint", [path, line, true], 0n).catch((error) => log.warn(error.message));
	}

	public remove_breakpoint(path: string, line: number) {
		this.session.debug_data.remove_breakpoint(path, line);
		void this.requestData("breakpoint", [path, line, false], 0n).catch((error) => log.warn(error.message));
	}

	public async request_stack_trace(start = 0, count = 100, signal?: AbortSignal) {
		return (await this.requestData("stack_trace", [start, count], this.state.stopId, 5000, signal)).payload;
	}

	public async request_scopes(frameId: number, signal?: AbortSignal) {
		return (await this.requestData("scopes", [frameId], this.state.stopId, 5000, signal)).payload;
	}

	public async request_variables(handle: bigint, start = 0, count = 100, signal?: AbortSignal) {
		return (await this.requestData("variables", [handle, start, count], this.state.stopId, 5000, signal)).payload;
	}

	public request_inspect_object(objectId: bigint) {
		void this.requestData("inspect_object_id", [objectId], this.state.paused ? this.state.stopId : 0n).then((message) => {
			this.session.acceptInspection(objectId, message.payload);
		}).catch((error) => log.warn(error.message));
	}

	public request_scene_tree() {
		void this.requestData("scene_snapshot", [], this.state.paused ? this.state.stopId : 0n).then((message) => {
			const treeData = message.payload[1];
			if (Array.isArray(treeData)) this.session.sceneTree.fill_tree(parse_next_scene_node(treeData));
		}).catch((error) => log.warn(error.message));
	}

	public set_object_property(objectId: bigint, label: string, value: any) {
		void this.requestData("set_object_property", [objectId, label, value], this.state.paused ? this.state.stopId : 0n).catch((error) => log.warn(error.message));
	}

	public async launch(args: LaunchRequestArguments) {
		log.info("Starting Godot 4 debugger protocol v2 in launch mode");
		await this.listen(args);
		await this.startGame(args);
	}

	public async attach(args: AttachRequestArguments) {
		log.info("Starting Godot 4 debugger protocol v2 in attach mode");
		await this.listen(args);
	}

	private async listen(args: AttachRequestArguments) {
		if (args.port === -1) args.port = await get_free_port();
		this.server = net.createServer((socket) => this.acceptSocket(socket));
		await new Promise<void>((resolve, reject) => {
			this.server?.once("error", reject);
			this.server?.listen(args.port, args.address, () => {
				this.server?.off("error", reject);
				resolve();
			});
		});
	}

	private acceptSocket(socket: net.Socket) {
		if (traceEnabled) console.log("Godot 4 v2 socket accepted");
		socket.setNoDelay(true);
		const context: SocketContextV2 = { socket, stream: new DebugPacketStreamV2() };
		this.contexts.set(socket, context);
		socket.on("data", (chunk) => {
			if (traceEnabled) console.log(`Godot 4 v2 received ${chunk.length} bytes: ${chunk.subarray(0, 24).toString("hex")}`);
			try {
				for (const message of context.stream.push(chunk)) this.receive(context, message);
			} catch (error) {
				if (traceEnabled) console.error("Godot 4 v2 decode failed:", error);
				log.error(error as Error);
				socket.destroy();
			}
		});
		socket.on("close", () => this.socketClosed(context));
		socket.on("error", (error) => log.warn(`Debugger v2 socket error: ${error.message}`));
	}

	private receive(context: SocketContextV2, message: DebugEnvelopeV2) {
		if (!context.hello) {
			if (traceEnabled) console.log(`Godot 4 v2 hello: ${message.type}`);
			if (message.type !== "control_hello" && message.type !== "data_hello") throw new Error("Debugger v2 channel did not begin with hello");
			context.hello = message;
			const pair = this.pairer.accept(message, context.socket);
			const ack: DebugEnvelopeV2 = { sessionId: message.sessionId, generation: message.generation, channel: message.channel, sequence: 1n, requestId: 1n, stopId: 0n, type: "hello_ack", payload: [250, 1000, 100] };
			context.socket.write(encodeEnvelopeV2(ack));
			if (pair) {
				this.state.activate(pair);
				this.controlSocket = pair.control as net.Socket;
				this.dataSocket = pair.data as net.Socket;
				this.startHeartbeat();
				log.info(`Debugger v2 paired session ${pair.sessionId}, generation ${pair.generation}`);
			}
			return;
		}

		if (context.socket !== this.controlSocket && context.socket !== this.dataSocket) return;
		if (this.state.receive(message) === "duplicate") return;
		socketLog.debug("rx:", [message.type, message.requestId.toString(), message.stopId.toString()]);
		if (message.channel === DebugChannelV2.Control) this.receiveControl(message);
		else this.receiveData(message);
	}

	private receiveControl(message: DebugEnvelopeV2) {
		if (message.type === "ack") {
			const pending = this.pendingControl.get(message.requestId);
			if (!pending) return;
			this.pendingControl.delete(message.requestId);
			clearTimeout(pending.timer);
			const accepted = Boolean(message.payload[0]);
			const reason = String(message.payload[2] ?? "rejected");
			if (!accepted) pending.reject(new Error(`Godot rejected ${pending.command}: ${reason}`));
			else {
				if (pending.command !== "pause") this.state.paused = false;
				pending.resolve(performance.now() - pending.started);
			}
			return;
		}
		if (message.type === "stopped") {
			if (traceEnabled) console.log(`Godot 4 v2 stopped: ${message.stopId}`);
			this.session.onStopped(message.stopId, Boolean(message.payload[0]), String(message.payload[1] ?? ""), Boolean(message.payload[2]));
			return;
		}
		if (message.type === "diagnostic") this.stderr(`[debugger] ${message.payload.join(" ")}\n`);
	}

	private receiveData(message: DebugEnvelopeV2) {
		if (traceEnabled) console.log(`Godot 4 v2 data ${message.type}: request=${message.requestId}, fields=${message.payload.length}`);
		if (message.requestId !== 0n) {
			const pending = this.pendingData.get(message.requestId);
			if (pending) {
				this.pendingData.delete(message.requestId);
				clearTimeout(pending.timer);
				pending.cleanup();
				if (message.type === "request_error") pending.reject(new Error(`${message.payload[0]}: ${message.payload[1]}`));
				else pending.resolve(message);
				return;
			}
		}
		if (message.type === "output") {
			const output = Array.isArray(message.payload[0]) ? message.payload[0][0] : message.payload[0];
			for (const line of String(output ?? "").split("\n")) debug.activeDebugConsole.appendLine(bbcodeParser.parse(line));
		} else if (message.type === "error") {
			void this.handleError(message.payload);
		} else if (message.type === "data_drop_summary") {
			this.stderr(`[debugger] dropped ${message.payload[0]} data messages (${message.payload[1]} bytes); queue=${message.payload[2]} bytes\n`);
		} else if (message.type === "noncontinuable_error") {
			const top = Array.isArray(message.payload[1]) && message.payload[1].length ? ` at ${message.payload[1][0][0]}:${message.payload[1][0][1]}` : "";
			this.stderr(`[debugger] non-continuable script error (execution was not left paused): ${message.payload[0]}${top}\n`);
		} else if (message.type === "kill_me") {
			this.abort();
		}
	}

	private execute(command: ExecutionCommandV2): Promise<number> {
		try { this.state.validateExecution(command); } catch (error) { return Promise.reject(error); }
		if (!this.controlSocket) return Promise.reject(new Error("Debugger v2 control channel is not connected"));
		const message = this.state.nextEnvelope(DebugChannelV2.Control, command, [], command === "pause" ? 0n : this.state.stopId);
		return new Promise<number>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingControl.delete(message.requestId);
				reject(new Error(`Timed out waiting for Godot ${command} acknowledgement`));
			}, 1250);
			this.pendingControl.set(message.requestId, { command, started: performance.now(), resolve, reject, timer });
			this.write(this.controlSocket as net.Socket, message);
		});
	}

	private requestData(type: string, payload: any[], stopId = this.state.stopId, timeoutMs = 5000, signal?: AbortSignal): Promise<DebugEnvelopeV2> {
		if (!this.dataSocket) return Promise.reject(new Error("Debugger v2 data channel is not connected"));
		if (signal?.aborted) return Promise.reject(new Error(`Godot ${type} request was cancelled`));
		const message = this.state.nextEnvelope(DebugChannelV2.Data, type, payload, stopId);
		return new Promise<DebugEnvelopeV2>((resolve, reject) => {
			const cancel = () => {
				const pending = this.pendingData.get(message.requestId);
				if (!pending) return;
				this.pendingData.delete(message.requestId);
				clearTimeout(pending.timer);
				pending.cleanup();
				reject(new Error(`Godot ${type} request was cancelled`));
			};
			const cleanup = () => signal?.removeEventListener("abort", cancel);
			const timer = setTimeout(() => {
				this.pendingData.delete(message.requestId);
				cleanup();
				reject(new Error(`Timed out waiting for Godot ${type} response`));
			}, timeoutMs);
			this.pendingData.set(message.requestId, { resolve, reject, timer, cleanup });
			signal?.addEventListener("abort", cancel, { once: true });
			this.write(this.dataSocket as net.Socket, message);
		});
	}

	private write(socket: net.Socket, message: DebugEnvelopeV2) {
		socketLog.debug("tx:", [message.type, message.requestId.toString(), message.stopId.toString()]);
		socket.write(encodeEnvelopeV2(message));
	}

	private startHeartbeat() {
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.heartbeat = setInterval(() => {
			if (!this.controlSocket || this.controlSocket.destroyed) return;
			const message = this.state.envelope(DebugChannelV2.Control, "heartbeat", [], 0n, this.state.stopId);
			this.write(this.controlSocket, message);
		}, 250);
	}

	private socketClosed(context: SocketContextV2) {
		this.contexts.delete(context.socket);
		this.pairer.discard(context.socket);
		if (context.socket === this.controlSocket) this.controlSocket = undefined;
		if (context.socket === this.dataSocket) this.dataSocket = undefined;
		if (!this.controlSocket || !this.dataSocket) {
			if (this.heartbeat) clearInterval(this.heartbeat);
			this.heartbeat = undefined;
			this.rejectPending(new Error("Debugger v2 channel disconnected; waiting for engine reconnect"));
		}
	}

	private rejectPending(error: Error) {
		for (const pending of this.pendingControl.values()) { clearTimeout(pending.timer); pending.reject(error); }
		for (const pending of this.pendingData.values()) { clearTimeout(pending.timer); pending.cleanup(); pending.reject(error); }
		this.pendingControl.clear();
		this.pendingData.clear();
	}

	private async startGame(args: LaunchRequestArguments) {
		const { godotPath } = await this.resolveGodot(args);
		let command = `"${godotPath}" --path "${args.project}"`;
		command += ` --remote-debug "debugv2://${args.address.replace("tcp://", "")}:${args.port}"`;
		if (args.profiling) command += " --profiling";
		if (args.single_threaded_scene) command += " --single-threaded-scene";
		if (args.debug_collisions) command += " --debug-collisions";
		if (args.debug_paths) command += " --debug-paths";
		if (args.debug_navigation) command += " --debug-navigation";
		if (args.debug_avoidance) command += " --debug-avoidance";
		if (args.debug_stringnames) command += " --debug-stringnames";
		if (args.disable_vsync) command += " --disable-vsync";
		if (args.frame_delay) command += ` --frame-delay ${args.frame_delay}`;
		if (args.time_scale) command += ` --time-scale ${args.time_scale}`;
		if (args.fixed_fps) command += ` --fixed-fps ${args.fixed_fps}`;
		if (args.scene && args.scene !== "main") command += ` "${this.resolveScene(args.scene)}"`;
		command += this.session.debug_data.get_breakpoint_string();
		if (args.additional_options) command += ` ${args.additional_options}`;
		log.info(`Launching game process using command: '${command}'`);
		if (traceEnabled) console.log(`Godot 4 v2 launch: ${command}`);
		const child = subProcess("debug", command, { shell: true, detached: true });
		child.stdout.on("data", (data) => { if (traceEnabled) console.log(`Godot 4 v2 stdout: ${data}`); });
		child.stderr.on("data", (data) => { if (traceEnabled) console.error(`Godot 4 v2 stderr: ${data}`); });
		child.on("close", (code) => { if (traceEnabled) console.log(`Godot 4 v2 exited: ${code}`); if (!this.stopping) this.abort(); });
	}

	private async resolveGodot(args: LaunchRequestArguments): Promise<{ godotPath: string; result: VERIFY_RESULT }> {
		const settingName = "editorPath.godot4";
		const requested = args.editor_path || get_configuration(settingName);
		const result = verify_godot_version(requested, "4");
		if (result.status === "WRONG_VERSION") {
			const projectVersion = await get_project_version();
			const message = `Cannot launch debug session: project uses Godot v${projectVersion}, executable is v${result.version}`;
			if (args.editor_path) window.showErrorMessage(message, "Ok"); else prompt_for_godot_executable(message, settingName);
			throw new Error(message);
		}
		if (result.status === "INVALID_EXE") {
			const message = `Cannot launch debug session: '${result.godotPath}' is not a valid Godot executable`;
			if (args.editor_path) window.showErrorMessage(message, "Ok"); else prompt_for_godot_executable(message, settingName);
			throw new Error(message);
		}
		return { godotPath: result.godotPath, result };
	}

	private resolveScene(scene: string) {
		if (scene === "pinned") {
			if (!pinnedScene) throw new Error("No pinned scene found");
			return pinnedScene.fsPath.endsWith(".gd") ? pinnedScene.fsPath.replace(/\.gd$/, ".tscn") : pinnedScene.fsPath;
		}
		if (scene === "current") {
			const current = window.activeTextEditor?.document.fileName;
			if (!current) throw new Error("No active editor. Open a file to launch it.");
			const resolved = current.endsWith(".gd") ? current.replace(/\.gd$/, ".tscn") : current;
			if (!fs.existsSync(resolved)) throw new Error(`Can't find associated scene file for ${resolved}`);
			return resolved;
		}
		return scene;
	}

	private async handleError(payload: any[]) {
		const params = payload[0] ?? [];
		const warning = Boolean(params[9]);
		const time = `${params[0]}:${params[1]}:${params[2]}.${params[3]}`;
		const location = `${params[4]}:${params[6]} @ ${params[5]}()`;
		const uri = await convert_resource_path_to_uri(params[4]);
		const extras = { source: { name: uri?.toString() ?? "" }, line: params[6], group: "startCollapsed" };
		this.stderr(`${warning ? ansi.yellow : ansi.red}${time} | ${params[8] || params[7]}\n`, extras);
		this.stderr(`${ansi.dim.white}<GDScript Source> ${ansi.white}${location}\n`, { group: "end" });
	}

	private stderr(output = "", extra = {}) {
		this.session.sendEvent({ event: "output", body: { category: "stderr", output: output + ansi.reset, ...extra } } as DebugProtocol.OutputEvent);
	}

	public abort() {
		if (this.stopping) return;
		this.session.sendEvent(new TerminatedEvent());
		this.stop();
	}

	public stop() {
		this.stopping = true;
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.rejectPending(new Error("Debugger stopped"));
		killSubProcesses("debug");
		for (const context of this.contexts.values()) context.socket.destroy();
		this.contexts.clear();
		this.server?.close();
		this.server = undefined;
	}
}

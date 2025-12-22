import * as net from "node:net";
import { EventEmitter } from "vscode";
import { createLogger, get_free_port } from "../utils";
import { RawObject } from "./debug_runtime";
import { parse_next_scene_node, split_buffers } from "./godot4/helpers";
import { VariantDecoder } from "./godot4/variables/variant_decoder";
import { VariantEncoder } from "./godot4/variables/variant_encoder";
import { SceneNode } from "./scene_tree_provider";

/**
 * Data returned when inspecting a remote object.
 */
export interface InspectedObject {
	objectId: bigint;
	className: string;
	properties: RawObject;
}

const log = createLogger("debugger.scene_tree_client", { output: "Godot Scene Tree" });

/**
 * A standalone TCP client that connects to Godot's debug protocol
 * specifically for retrieving scene tree data.
 *
 * This allows C# projects to view the Active Scene Tree by connecting
 * to Godot's debug server independently of the C# debugger.
 */
export class SceneTreeClient {
	private encoder = new VariantEncoder();
	private decoder = new VariantDecoder();
	private server?: net.Server;
	private socket?: net.Socket;
	private stash?: Buffer;
	private commandBuffer: Buffer[] = [];
	private draining = false;
	private _isConnected = false;
	private _port = 0;
	private didFirstOutput = false;

	// Events
	private _onSceneTree = new EventEmitter<SceneNode>();
	public readonly onSceneTree = this._onSceneTree.event;

	private _onInspectObject = new EventEmitter<InspectedObject>();
	public readonly onInspectObject = this._onInspectObject.event;

	private _onConnected = new EventEmitter<void>();
	public readonly onConnected = this._onConnected.event;

	private _onDisconnected = new EventEmitter<void>();
	public readonly onDisconnected = this._onDisconnected.event;

	private _onError = new EventEmitter<Error>();
	public readonly onError = this._onError.event;

	private _onPauseStateChanged = new EventEmitter<boolean>();
	public readonly onPauseStateChanged = this._onPauseStateChanged.event;

	// Debug control state
	private _isPaused = false;

	public get isConnected(): boolean {
		return this._isConnected;
	}

	public get isPaused(): boolean {
		return this._isPaused;
	}

	public get port(): number {
		return this._port;
	}

	/**
	 * Start the TCP server and wait for Godot to connect.
	 * Godot should be launched with: --remote-debug tcp://127.0.0.1:<port>
	 */
	public async start(port?: number): Promise<number> {
		if (this.server) {
			log.warn("Server already running");
			return this._port;
		}

		this._port = port ?? (await get_free_port());

		return new Promise((resolve, reject) => {
			this.server = net.createServer((socket) => {
				log.info("Godot connected to Scene Tree Monitor");
				this.socket = socket;
				this._isConnected = true;
				this._onConnected.fire();

				socket.on("data", this.onData.bind(this));

				socket.on("close", () => {
					log.info("Connection closed");
					this._isConnected = false;
					this.socket = undefined;
					this._onDisconnected.fire();
				});

				socket.on("end", () => {
					log.debug("Connection ended");
					this._isConnected = false;
					this.socket = undefined;
					this._onDisconnected.fire();
				});

				socket.on("error", (error) => {
					log.error("Socket error:", error);
					this._onError.fire(error);
				});

				socket.on("drain", () => {
					socket.resume();
					this.draining = false;
					this.sendBuffer();
				});
			});

			this.server.on("error", (error) => {
				log.error("Server error:", error);
				this._onError.fire(error);
				reject(error);
			});

			this.server.listen(this._port, "127.0.0.1", () => {
				log.info(`Scene Tree Monitor listening on port ${this._port}`);
				resolve(this._port);
			});
		});
	}

	/**
	 * Stop the TCP server and disconnect any active connection.
	 */
	public stop(): void {
		log.info("Stopping Scene Tree Monitor");

		this._isConnected = false;

		if (this.socket) {
			this.socket.destroy();
			this.socket = undefined;
		}

		if (this.server) {
			this.server.close((error) => {
				if (error) {
					log.error("Error closing server:", error);
				}
				this.server?.unref();
				this.server = undefined;
			});
		}

		this.stash = undefined;
		this.commandBuffer = [];
		this.draining = false;
		this.didFirstOutput = false;
	}

	/**
	 * Attach to an already-running Godot instance.
	 * Godot must have been launched with: --remote-debug tcp://127.0.0.1:<port>
	 * In this mode, we connect TO Godot (client mode) instead of Godot connecting to us (server mode).
	 */
	public async attach(address: string, port: number): Promise<boolean> {
		if (this._isConnected) {
			log.warn("Already connected");
			return true;
		}

		if (this.server) {
			log.warn("Server is running - stop it before attaching");
			return false;
		}

		this._port = port;

		return new Promise((resolve) => {
			log.info(`Attaching to Godot at ${address}:${port}`);

			const socket = net.createConnection({ host: address, port }, () => {
				log.info("Connected to Godot debug server");
				this.socket = socket;
				this._isConnected = true;
				this._onConnected.fire();

				// Request scene tree after connection
				setTimeout(() => {
					if (this._isConnected) {
						this.requestSceneTree();
					}
				}, 500);

				resolve(true);
			});

			socket.on("data", this.onData.bind(this));

			socket.on("close", () => {
				log.info("Connection closed");
				this._isConnected = false;
				this.socket = undefined;
				this._onDisconnected.fire();
			});

			socket.on("end", () => {
				log.debug("Connection ended");
				this._isConnected = false;
				this.socket = undefined;
				this._onDisconnected.fire();
			});

			socket.on("error", (error) => {
				log.error("Socket error:", error);
				this._onError.fire(error);
				resolve(false);
			});

			socket.on("drain", () => {
				socket.resume();
				this.draining = false;
				this.sendBuffer();
			});

			// Timeout after 5 seconds
			socket.setTimeout(5000, () => {
				log.warn("Connection timeout");
				socket.destroy();
				resolve(false);
			});
		});
	}

	/**
	 * Request the current scene tree from Godot.
	 * Note: In Godot 4.x, scene tree data may be available even while running.
	 */
	public requestSceneTree(): void {
		if (!this._isConnected) {
			log.warn("Cannot request scene tree: not connected");
			return;
		}
		log.info("Requesting scene tree from Godot");
		this.sendCommand("scene:request_scene_tree");
	}

	/**
	 * Request inspection of a specific object by ID.
	 */
	public requestInspectObject(objectId: bigint): void {
		if (!this._isConnected) {
			log.warn("Cannot inspect object: not connected");
			return;
		}
		this.sendCommand("scene:inspect_object", [objectId]);
	}

	// ========================================
	// Debug Control Methods (Tier 1 Features)
	// ========================================

	/**
	 * Pause game execution by suspending the SceneTree.
	 * Uses scene:suspend_changed command which actually pauses game logic.
	 * Note: This is different from debugger "break" which only pauses GDScript debugging.
	 */
	public pause(): void {
		if (!this._isConnected) {
			log.warn("Cannot pause: not connected");
			return;
		}
		log.info("Sending scene suspend command (pause)");
		this.sendCommand("scene:suspend_changed", [true]);
		this._isPaused = true;
		this._onPauseStateChanged.fire(true);
	}

	/**
	 * Resume game execution by unsuspending the SceneTree.
	 * Uses scene:suspend_changed command to resume game logic.
	 */
	public resume(): void {
		if (!this._isConnected) {
			log.warn("Cannot resume: not connected");
			return;
		}
		log.info("Sending scene unsuspend command (resume)");
		this.sendCommand("scene:suspend_changed", [false]);
		this._isPaused = false;
		this._onPauseStateChanged.fire(false);
	}

	/**
	 * Advance exactly one frame then pause again.
	 * Uses the scene debugger's next_frame command (Godot 4.x).
	 * IMPORTANT: This only works when SceneTree is suspended (via pause()).
	 */
	public nextFrame(): void {
		if (!this._isConnected) {
			log.warn("Cannot step frame: not connected");
			return;
		}
		if (!this._isPaused) {
			log.warn("Cannot step frame: game must be paused first");
			return;
		}
		log.info("Sending next frame command");
		this.sendCommand("scene:next_frame");
		// Game stays paused after advancing one frame
	}

	/**
	 * Set a property on a remote object.
	 * Changes are RUNTIME ONLY - scene files are not modified.
	 * Works for primitive types (int, float, string, bool, Vector3, Color).
	 * Note: Node-type properties have a Godot bug where setters don't run.
	 */
	public setObjectProperty(objectId: bigint, property: string, value: any): void {
		if (!this._isConnected) {
			log.warn("Cannot set property: not connected");
			return;
		}
		log.info(`Setting property ${property} on object ${objectId}`);
		this.sendCommand("scene:set_object_property", [objectId, property, value]);
	}

	private onData(buffer: Buffer): void {
		if (this.stash) {
			buffer = Buffer.concat([this.stash, buffer]);
			this.stash = undefined;
		}

		const buffers = split_buffers(buffer);
		while (buffers.length > 0) {
			const chunk = buffers.shift();
			const data = this.decoder.get_dataset(chunk)?.slice(1);
			if (data === undefined) {
				// Incomplete buffer, stash for later
				this.stash = Buffer.alloc(chunk.length);
				chunk.copy(this.stash);
				return;
			}

			// data[0] is the full message array: [command, threadId?, parameters]
			const message = data[0] as any[];
			if (!message || !Array.isArray(message)) {
				log.warn("Invalid message format received");
				continue;
			}

			log.info("Received command:", message[0]);
			this.handleMessage(message);
		}
	}

	private handleMessage(message: any[]): void {
		// Parse message format: [command, threadId?, parameters]
		// Thread ID is included in Godot 4.2+
		const command: string = message[0];
		let parameters: any[];
		if (Array.isArray(message[1])) {
			// No thread ID (Godot < 4.2)
			parameters = message[1];
		} else if (Array.isArray(message[2])) {
			// Has thread ID (Godot >= 4.2)
			parameters = message[2];
		} else {
			parameters = [];
		}

		switch (command) {
			case "scene:scene_tree": {
				log.info("Parsing scene tree from parameters (count:", parameters?.length, ")");
				try {
					const tree = parse_next_scene_node(parameters);
					log.info(`Scene tree received: root="${tree?.label}", class="${tree?.class_name}", children=${tree?.children?.length ?? 0}`);
					this._onSceneTree.fire(tree);
				} catch (err) {
					log.error("Error parsing scene tree:", err);
				}
				break;
			}
			case "debug_enter": {
				// When debugger stops (paused), update state and request scene tree
				log.info("Debug enter - Godot paused, requesting scene tree");
				this._isPaused = true;
				this._onPauseStateChanged.fire(true);
				this.sendCommand("scene:request_scene_tree");
				break;
			}
			case "scene:inspect_object": {
				log.info("Parsing inspect_object response");
				try {
					// Parameters: [objectId, className, properties[]]
					// Each property is: [name, type, hint, hint_string, usage, value]
					let objectId = BigInt(parameters[0]);
					const className: string = parameters[1];
					const properties: any[] = parameters[2] || [];

					// Convert signed to unsigned if negative (Godot sends as signed 64-bit)
					if (objectId < 0) {
						objectId = objectId + BigInt(2) ** BigInt(64);
					}

					const rawObject = new RawObject(className);
					for (const prop of properties) {
						// prop[0] = name, prop[5] = value
						rawObject.set(prop[0], prop[5]);
					}

					log.info(`Inspect object received: id=${objectId}, class=${className}, props=${properties.length}`);
					this._onInspectObject.fire({
						objectId,
						className,
						properties: rawObject,
					});
				} catch (err) {
					log.error("Error parsing inspect_object:", err);
				}
				break;
			}
			case "output": {
				// Request scene tree on first output (game started running)
				if (!this.didFirstOutput) {
					this.didFirstOutput = true;
					log.debug("First output - requesting scene tree");
					this.requestSceneTree();
				}
				break;
			}
			case "set_pid": {
				// Godot sends this immediately on connection - request scene tree after a short delay
				log.debug("set_pid received - will request scene tree");
				setTimeout(() => {
					if (this._isConnected) {
						log.debug("Requesting scene tree after set_pid");
						this.requestSceneTree();
					}
				}, 1000);
				break;
			}
			case "error": {
				// Log full error details - format is typically [hr, min, sec, msec, type, func, file, line, error, explanation, ...]
				log.warn("Godot error received (full):", JSON.stringify(parameters));
				break;
			}
			case "debug_exit": {
				// When debugger resumes (running), update state
				log.info("Debug exit - Godot resumed");
				this._isPaused = false;
				this._onPauseStateChanged.fire(false);
				break;
			}
			case "performance:profile_frame":
			case "message:click_ctrl":
			case "stack_dump":
			case "stack_frame_vars":
			case "stack_frame_var":
				// Ignore these messages - we only care about scene tree
				break;
			default:
				log.debug(`Ignoring message: ${command}`);
		}
	}

	private sendCommand(command: string, parameters: any[] = []): void {
		// Godot 4.2+ requires 3 elements: [command, threadId, parameters]
		// Using threadId of 1 (main thread) for all commands
		const commandArray: any[] = [command, 1, parameters];
		log.info("Sending command:", command);
		const buffer = this.encoder.encode_variant(commandArray);
		this.commandBuffer.push(buffer);
		this.sendBuffer();
	}

	private sendBuffer(): void {
		if (!this.socket) {
			log.warn("sendBuffer called but no socket");
			return;
		}

		while (!this.draining && this.commandBuffer.length > 0) {
			const command = this.commandBuffer.shift();
			log.info(`Writing ${command.length} bytes to socket`);
			this.draining = !this.socket.write(command);
		}
	}
}

import * as fs from "node:fs";
import { InvalidatedEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import {
	CancellationToken,
	DebugAdapterDescriptor,
	DebugAdapterDescriptorFactory,
	DebugAdapterInlineImplementation,
	DebugConfiguration,
	DebugConfigurationProvider,
	DebugSession,
	EventEmitter,
	ExtensionContext,
	FileDecoration,
	FileDecorationProvider,
	ProviderResult,
	Uri,
	WorkspaceFolder,
	debug,
	window,
	workspace,
} from "vscode";
import { createLogger, get_project_version, register_command, set_context } from "../utils";
import { GodotVariable } from "./debug_runtime";
import { GodotDebugSession as Godot3DebugSession } from "./godot3/debug_session";
import { GodotDebugSession as Godot4DebugSession } from "./godot4/debug_session";
import { GodotObject } from "./godot4/variables/godot_object_promise";
import { InspectorProvider, RemoteProperty } from "./inspector_provider";
import { SceneNode, SceneTreeProvider } from "./scene_tree_provider";
import { SceneTreeMonitor } from "./scene_tree_monitor";

const log = createLogger("debugger", { output: "Godot Debugger" });

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	address: string;
	port: number;
	project: string;
	scene: string;
	editor_path: string;
	profiling: boolean;
	single_threaded_scene: boolean;
	debug_collisions: boolean;
	debug_paths: boolean;
	debug_navigation: boolean;
	debug_avoidance: boolean;
	debug_stringnames: boolean;
	frame_delay: number;
	time_scale: number;
	disable_vsync: boolean;
	fixed_fps: number;
	additional_options: string;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	address: string;
	port: number;
	project: string;
	scene: string;
	additional_options: string;
}

export let pinnedScene: Uri;

class GDFileDecorationProvider implements FileDecorationProvider {
	private emitter = new EventEmitter<Uri>();
	onDidChangeFileDecorations = this.emitter.event;

	update(uri: Uri) {
		this.emitter.fire(uri);
	}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "file") return undefined;
		if (pinnedScene && uri.fsPath === pinnedScene.fsPath) {
			return {
				badge: "🖈",
			};
		}
	}
}

export class GodotDebugger implements DebugAdapterDescriptorFactory, DebugConfigurationProvider {
	public session?: Godot3DebugSession | Godot4DebugSession;
	public sceneTree = new SceneTreeProvider();
	public inspector = new InspectorProvider();
	public sceneTreeMonitor: SceneTreeMonitor;

	fileDecorations = new GDFileDecorationProvider();

	constructor(private context: ExtensionContext) {
		log.info("Initializing Godot Debugger");

		this.restore_pinned_file();

		// Initialize Scene Tree Monitor for C# projects
		this.sceneTreeMonitor = new SceneTreeMonitor(this.sceneTree, this.inspector);

		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot", this),
			debug.registerDebugAdapterDescriptorFactory("godot", this),
			window.registerFileDecorationProvider(this.fileDecorations),
			register_command("debugger.inspectNode", this.inspect_node.bind(this)),
			register_command("debugger.refreshSceneTree", this.refresh_scene_tree.bind(this)),
			register_command("debugger.refreshInspector", this.refresh_inspector.bind(this)),
			register_command("debugger.editValue", this.edit_value.bind(this)),
			register_command("debugger.debugCurrentFile", this.debug_current_file.bind(this)),
			register_command("debugger.debugPinnedFile", this.debug_pinned_file.bind(this)),
			register_command("debugger.pinFile", this.pin_file.bind(this)),
			register_command("debugger.unpinFile", this.unpin_file.bind(this)),
			register_command("debugger.openPinnedFile", this.open_pinned_file.bind(this)),
			// Scene Tree Monitor commands
			register_command("sceneTreeMonitor.stop", this.stop_scene_tree_monitor.bind(this)),
			// Auto-start Scene Tree Monitor for C# debug sessions
			debug.onDidStartDebugSession(this.on_debug_session_start.bind(this)),
			this.inspector.view,
			this.sceneTree.view,
		);
	}

	public async createDebugAdapterDescriptor(session: DebugSession): Promise<DebugAdapterDescriptor> {
		log.info("Creating debug session");
		const projectVersion = await get_project_version();
		log.info(`Project version identified as ${projectVersion}`);

		if (projectVersion.startsWith("4")) {
			this.session = new Godot4DebugSession(projectVersion);
		} else {
			this.session = new Godot3DebugSession();
		}
		this.context.subscriptions.push(this.session);

		this.session.sceneTree = this.sceneTree;
		this.session.inspector = this.inspector;

		this.sceneTree.clear();
		this.inspector.clear();

		return new DebugAdapterInlineImplementation(this.session);
	}

	public resolveDebugConfiguration(
		folder: WorkspaceFolder | undefined,
		config: DebugConfiguration,
		token?: CancellationToken,
	): ProviderResult<DebugConfiguration> {
		// request is actually a required field according to vscode
		// however, setting it here lets us catch a possible misconfiguration
		if (!config.request) {
			config.request = "launch";
		}

		if (config.request === "launch") {
			if (!config.address) {
				config.address = "127.0.0.1";
			}
			if (!config.port) {
				config.port = -1;
			}
			if (!config.project) {
				config.project = "${workspaceFolder}";
			}
		}

		if (typeof config.port !== "number" || config.port < -1 || config.port > 65535) {
			window.showErrorMessage("Can't launch debug session: 'port' must be a number between -1 and 65535.", "Ok");
			return undefined;
		}

		if (config.address.includes("://")) {
			window.showErrorMessage("Can't launch debug session: 'address' cannot include a protocol.", "Ok");
			return undefined;
		}

		return config;
	}

	public debug_current_file() {
		log.info("Attempting to debug current file");
		const configs: DebugConfiguration[] = workspace
			.getConfiguration("launch", window.activeTextEditor.document.uri)
			.get("configurations");
		const launches = configs.filter((c) => c.request === "launch");
		const currents = configs.filter((c) => c.scene === "current");

		let path = window.activeTextEditor.document.fileName;
		if (path.endsWith(".gd")) {
			const scenePath = path.replace(".gd", ".tscn");
			if (!fs.existsSync(scenePath)) {
				const message = `Can't launch debug session: no associated scene for '${path}'. (Script and scene file must have the same name.)`;
				log.warn(message);
				window.showWarningMessage(message);
				return;
			}
			path = scenePath;
		}

		const default_config = {
			name: `Debug ${path} : 'File'}`,
			type: "godot",
			request: "launch",
			scene: "current",
		};

		const config = currents[0] ?? launches[0] ?? configs[0] ?? default_config;
		config.scene = path;

		log.info(`Starting debug session for '${path}'`);
		debug.startDebugging(workspace.workspaceFolders[0], config);
	}

	public debug_pinned_file() {
		log.info("Attempting to debug pinned scene");
		const configs: DebugConfiguration[] = workspace.getConfiguration("launch", pinnedScene).get("configurations");
		const launches = configs.filter((c) => c.request === "launch");
		const currents = configs.filter((c) => c.scene === "pinned");

		if (!pinnedScene) {
			log.warn("No pinned scene found, aborting debug");
			window.showWarningMessage("No pinned scene found");
			return;
		}
		let path = pinnedScene.fsPath;
		if (path.endsWith(".gd")) {
			const scenePath = path.replace(".gd", ".tscn");
			if (!fs.existsSync(scenePath)) {
				log.warn(`Can't find associated scene for '${path}', aborting debug`);
				window.showWarningMessage(`Can't find associated scene file for '${path}'`);
				return;
			}
			path = scenePath;
		}
		const default_config = {
			name: `Debug ${path} : 'File'}`,
			type: "godot",
			request: "launch",
			scene: "pinned",
		};

		const config = currents[0] ?? launches[0] ?? configs[0] ?? default_config;
		config.scene = path;

		log.info(`Starting debug session for '${path}'`);
		debug.startDebugging(workspace.workspaceFolders[0], config);
	}

	public pin_file(uri: Uri) {
		let _uri = uri;
		if (uri === undefined) {
			_uri = window.activeTextEditor.document.uri;
		}
		log.info(`Pinning debug target file: '${_uri.fsPath}'`);
		set_context("pinnedScene", [_uri.fsPath]);
		if (pinnedScene) {
			this.fileDecorations.update(pinnedScene);
		}
		pinnedScene = _uri;
		this.context.workspaceState.update("pinnedScene", pinnedScene);
		this.fileDecorations.update(_uri);
	}

	public unpin_file(uri: Uri) {
		log.info(`Unpinning debug target file: '${pinnedScene}'`);
		set_context("pinnedScene", []);
		const previousPinnedScene = pinnedScene;
		pinnedScene = undefined;
		this.context.workspaceState.update("pinnedScene", pinnedScene);
		this.fileDecorations.update(previousPinnedScene);
	}

	public restore_pinned_file() {
		pinnedScene = this.context.workspaceState.get("pinnedScene", undefined);
		if (pinnedScene) {
			log.info(`Restoring pinned debug target file: '${pinnedScene.fsPath}'`);
			set_context("pinnedScene", [pinnedScene.fsPath]);
		}
	}

	public open_pinned_file() {
		log.info(`Opening pinned debug target file: '${pinnedScene}'`);
		if (pinnedScene) {
			window.showTextDocument(pinnedScene);
		}
	}

	public async inspect_node(element: SceneNode | RemoteProperty) {
		// Guard against undefined element (e.g., node was removed from scene)
		if (!element || element.object_id === undefined) {
			log.warn("Cannot inspect node: element is undefined or has no object_id");
			return;
		}

		// If Scene Tree Monitor is connected, use it for inspection
		if (this.sceneTreeMonitor.isConnected) {
			this.sceneTreeMonitor.inspectObject(element.label, BigInt(element.object_id));
			return;
		}
		// Otherwise use the debug session
		await this.fill_inspector(element);
	}

	private async fill_inspector(element: SceneNode | RemoteProperty, force_refresh = false) {
		if (this.session instanceof Godot4DebugSession) {
			const godot_object = await this.session.variables_manager?.get_godot_object(
				BigInt(element.object_id),
				force_refresh,
			);
			if (!godot_object) {
				return;
			}
			const va = this.create_godot_variable(godot_object);
			this.inspector.fill_tree(element.label, godot_object.type, Number(godot_object.godot_id), va);
		} else {
			this.session?.controller.request_inspect_object(BigInt(element.object_id));
			this.session?.inspect_callbacks.set(BigInt(element.object_id), (class_name, variable) => {
				this.inspector.fill_tree(element.label, class_name, Number(element.object_id), variable);
			});
		}
	}

	private create_godot_variable(godot_object: GodotObject): GodotVariable {
		return {
			value: {
				type_name: () => godot_object.type,
				stringify_value: () => `<${godot_object.godot_id}>`,
				sub_values: () => godot_object.sub_values,
			},
		} as GodotVariable;
	}

	public refresh_scene_tree() {
		// If Scene Tree Monitor is running and connected, use it
		if (this.sceneTreeMonitor.isConnected) {
			this.sceneTreeMonitor.refreshSceneTree();
			return;
		}
		// Otherwise use the debug session
		this.session?.controller.request_scene_tree();
	}

	// Scene Tree Monitor methods
	public stop_scene_tree_monitor() {
		this.sceneTreeMonitor.stop();
	}

	/**
	 * Auto-start Scene Tree Monitor when a C# debug session starts.
	 * This detects coreclr sessions in Godot projects and automatically
	 * starts the monitor so users don't have to click the button manually.
	 */
	private async on_debug_session_start(session: DebugSession) {
		// Only handle coreclr (C#) sessions, not our own godot sessions
		if (session.type !== "coreclr") {
			return;
		}

		// Check if this is a Godot project
		const projectVersion = await get_project_version();
		if (!projectVersion?.startsWith("4")) {
			return;
		}

		// Check if auto-start is enabled (default: true)
		const autoStart = workspace.getConfiguration("godotTools").get("sceneTreeMonitor.autoStart", true);
		if (!autoStart) {
			return;
		}

		// Don't start if already running
		if (this.sceneTreeMonitor.isRunning) {
			return;
		}

		log.info("C# debug session detected in Godot project - auto-starting Scene Tree Monitor");
		await this.sceneTreeMonitor.start();
	}

	public async refresh_inspector() {
		if (this.inspector.has_tree()) {
			const item = this.inspector.get_top_item();
			await this.fill_inspector(item, /*force_refresh*/ true);
		}
	}

	public async edit_value(property: RemoteProperty) {
		const previous_value = property.value;
		const type = typeof previous_value;
		const is_float = type === "number" && !Number.isInteger(previous_value);
		const value = await window.showInputBox({ value: `${property.description}` });
		let new_parsed_value: any;
		switch (type) {
			case "string":
				new_parsed_value = value;
				break;
			case "number":
				if (is_float) {
					new_parsed_value = Number.parseFloat(value);
					if (Number.isNaN(new_parsed_value)) {
						return;
					}
				} else {
					new_parsed_value = Number.parseInt(value);
					if (Number.isNaN(new_parsed_value)) {
						return;
					}
				}
				break;
			case "boolean":
				if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
					new_parsed_value = value.toLowerCase() === "true";
				} else if (value === "0" || value === "1") {
					new_parsed_value = value === "1";
				} else {
					return;
				}
		}
		if (property.changes_parent) {
			const parents = [property.parent];
			let idx = 0;
			while (parents[idx].changes_parent) {
				parents.push(parents[idx++].parent);
			}
			const changed_value = this.inspector.get_changed_value(parents, property, new_parsed_value);
			this.session?.controller.set_object_property(BigInt(property.object_id), parents[idx].label, changed_value);
		} else {
			this.session?.controller.set_object_property(BigInt(property.object_id), property.label, new_parsed_value);
		}

		const item = this.inspector.get_top_item();
		await this.fill_inspector(item, /*force_refresh*/ true);

		// const res = await debug.activeDebugSession?.customRequest("refreshVariables"); // refresh vscode.debug variables
		this.session.sendEvent(new InvalidatedEvent(["variables"]));
	}
}

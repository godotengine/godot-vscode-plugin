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
import { InspectorWebView } from "./inspector_webview";
import { SceneNode, SceneTreeProvider } from "./scene_tree_provider";
import { SceneTreeMonitor } from "./scene_tree_monitor";
import { GameDebugControlsProvider } from "./game_debug_controls_provider";

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
	public inspectorOld = new InspectorProvider(); // Keep for session compatibility
	public inspectorWebView: InspectorWebView;
	public gameDebugControls = new GameDebugControlsProvider();
	public sceneTreeMonitor: SceneTreeMonitor;

	fileDecorations = new GDFileDecorationProvider();

	constructor(private context: ExtensionContext) {
		log.info("Initializing Godot Debugger");

		this.restore_pinned_file();

		// Initialize WebView Inspector
		this.inspectorWebView = new InspectorWebView(context.extensionUri);

		// Initialize Scene Tree Monitor for C# projects
		this.sceneTreeMonitor = new SceneTreeMonitor(this.sceneTree, this.inspectorWebView, this.gameDebugControls);

		// Set up the edit callbacks for the WebView inspector
		this.inspectorWebView.setEditCallback(this.handleWebViewEdit.bind(this));
		this.inspectorWebView.setEditCompoundCallback(this.handleWebViewCompoundEdit.bind(this));

		// Set up the inspect object callback for drilling into resources (ObjectId)
		this.inspectorWebView.setInspectObjectCallback(this.handleWebViewInspectObject.bind(this));

		// Register WebView provider FIRST to avoid "No view is registered" error on startup
		context.subscriptions.push(
			window.registerWebviewViewProvider(InspectorWebView.viewType, this.inspectorWebView),
		);

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
			// Debug control commands (Tier 1 features)
			register_command("debugger.pause", this.pause_game.bind(this)),
			register_command("debugger.resume", this.resume_game.bind(this)),
			register_command("debugger.nextFrame", this.next_frame.bind(this)),
			// Auto-start Scene Tree Monitor for C# debug sessions
			debug.onDidStartDebugSession(this.on_debug_session_start.bind(this)),
			this.sceneTree.view,
			this.gameDebugControls.view,
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
		this.session.inspector = this.inspectorOld; // Session still uses old provider for internal logic

		this.sceneTree.clear();
		this.inspectorWebView.clear();

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
			this.inspectorWebView.fill_tree(element.label, godot_object.type, Number(godot_object.godot_id), va);
		} else {
			this.session?.controller.request_inspect_object(BigInt(element.object_id));
			this.session?.inspect_callbacks.set(BigInt(element.object_id), (class_name, variable) => {
				this.inspectorWebView.fill_tree(element.label, class_name, Number(element.object_id), variable);
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

	// Debug control methods (Tier 1 features)
	public pause_game() {
		this.sceneTreeMonitor.pause();
	}

	public resume_game() {
		this.sceneTreeMonitor.resume();
	}

	public next_frame() {
		this.sceneTreeMonitor.nextFrame();
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
		if (this.inspectorWebView.has_tree()) {
			const item = this.inspectorWebView.get_top_item();
			if (item) {
				// Create a minimal element for fill_inspector
				await this.fill_inspector({ label: item.label, object_id: item.object_id } as SceneNode, /*force_refresh*/ true);
			}
		}
	}

	public async edit_value(property: RemoteProperty) {
		// Guard against undefined value (can happen with compound type sub-properties)
		if (property.value === undefined) {
			log.warn(`Cannot edit property '${property.label}': value is undefined`);
			window.showWarningMessage(`Cannot edit '${property.label}': value is undefined. This may be a compound type that requires editing individual components.`);
			return;
		}

		const previous_value = property.value;
		const type = typeof previous_value;
		// For compound type sub-properties (Vector3.x, Color.r, etc.), always treat as float
		// because compound types use floats even if the current value happens to be a whole number
		const is_compound_child = property.changes_parent === true;
		const is_float = type === "number" && (is_compound_child || !Number.isInteger(previous_value));
		const value = await window.showInputBox({ value: `${property.description}` });
		if (value === undefined) {
			return; // User cancelled
		}
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

		// Determine which backend to use for setting the property
		const useSceneTreeMonitor = this.sceneTreeMonitor.isConnected;

		log.info(`Editing property '${property.label}': changes_parent=${property.changes_parent}, parent=${property.parent?.label}, value=${new_parsed_value}`);

		if (property.changes_parent) {
			// Check if parent exists
			if (!property.parent) {
				log.error(`Cannot edit '${property.label}': changes_parent is true but parent is undefined`);
				window.showWarningMessage(`Cannot edit '${property.label}': parent property is missing`);
				return;
			}

			const parents = [property.parent];
			let idx = 0;
			while (parents[idx]?.changes_parent) {
				if (!parents[idx].parent) {
					log.error(`Cannot edit '${property.label}': parent chain is broken at '${parents[idx].label}'`);
					window.showWarningMessage(`Cannot edit '${property.label}': parent chain is incomplete`);
					return;
				}
				parents.push(parents[idx++].parent);
			}

			log.info(`Parent chain: ${parents.map(p => p.label).join(" -> ")}, root index: ${idx}`);

			const changed_value = this.inspectorOld.get_changed_value(parents, property, new_parsed_value);
			log.info(`Setting property '${parents[idx].label}' with changed value:`, changed_value);

			if (useSceneTreeMonitor) {
				this.sceneTreeMonitor.setObjectProperty(BigInt(property.object_id), parents[idx].label, changed_value);
			} else {
				this.session?.controller.set_object_property(BigInt(property.object_id), parents[idx].label, changed_value);
			}
		} else {
			log.info(`Setting property '${property.label}' directly to:`, new_parsed_value);
			if (useSceneTreeMonitor) {
				this.sceneTreeMonitor.setObjectProperty(BigInt(property.object_id), property.label, new_parsed_value);
			} else {
				this.session?.controller.set_object_property(BigInt(property.object_id), property.label, new_parsed_value);
			}
		}

		// Refresh the inspector to show updated values
		if (useSceneTreeMonitor) {
			// For Scene Tree Monitor, re-inspect the object
			this.sceneTreeMonitor.refreshInspector();
		} else if (this.inspectorOld.has_tree()) {
			const item = this.inspectorOld.get_top_item();
			await this.fill_inspector(item, /*force_refresh*/ true);
		}

		// Refresh VSCode debug variables if session exists
		if (this.session) {
			this.session.sendEvent(new InvalidatedEvent(["variables"]));
		}
	}

	/**
	 * Handle compound value edit requests from the WebView inspector.
	 * This is called when the user edits a compound type (Vector3, Color, etc.) inline.
	 * The value is already reconstructed by the WebView.
	 */
	private handleWebViewCompoundEdit(objectId: number, propertyName: string, reconstructedValue: any): void {
		const useSceneTreeMonitor = this.sceneTreeMonitor.isConnected;

		log.info(`WebView compound edit: Setting property '${propertyName}' to:`, reconstructedValue);

		if (useSceneTreeMonitor) {
			this.sceneTreeMonitor.setObjectProperty(BigInt(objectId), propertyName, reconstructedValue);
		} else {
			this.session?.controller.set_object_property(BigInt(objectId), propertyName, reconstructedValue);
		}

		// Refresh the inspector to show updated values
		if (useSceneTreeMonitor) {
			this.sceneTreeMonitor.refreshInspector();
		} else {
			this.refresh_inspector();
		}

		// Refresh VSCode debug variables if session exists
		if (this.session) {
			this.session.sendEvent(new InvalidatedEvent(["variables"]));
		}
	}

	/**
	 * Handle clicking on an ObjectId to drill down into a resource.
	 * This allows inspecting nested resources like Materials, Meshes, Textures, etc.
	 */
	private handleWebViewInspectObject(objectIdStr: string): void {
		const objectId = BigInt(objectIdStr);

		log.info(`WebView inspect object: Drilling into ObjectId ${objectId}`);

		// Use Scene Tree Monitor if connected (C# projects)
		if (this.sceneTreeMonitor.isConnected) {
			this.sceneTreeMonitor.inspectObject("Resource", objectId);
		} else if (this.session) {
			// Use debug session for GDScript projects
			// Create a minimal element for fill_inspector
			this.fill_inspector({ label: "Resource", object_id: Number(objectId) } as SceneNode, /*force_refresh*/ true);
		}
	}

	/**
	 * Handle edit requests from the WebView inspector.
	 * This is called when the user edits a value inline in the WebView.
	 */
	private handleWebViewEdit(objectId: number, propertyPath: string[], newValue: any, changesParent: boolean): void {
		const useSceneTreeMonitor = this.sceneTreeMonitor.isConnected;

		// For simple properties (not changing parent), just set directly
		if (!changesParent || propertyPath.length === 1) {
			const propertyName = propertyPath[propertyPath.length - 1];
			log.info(`WebView edit: Setting property '${propertyName}' to:`, newValue);

			if (useSceneTreeMonitor) {
				this.sceneTreeMonitor.setObjectProperty(BigInt(objectId), propertyName, newValue);
			} else {
				this.session?.controller.set_object_property(BigInt(objectId), propertyName, newValue);
			}
		} else {
			// For compound properties (e.g., Vector3.x), we need to reconstruct the parent
			// This is more complex and requires getting the current value first
			// For now, we'll handle simple cases and log a warning for complex ones
			const propertyName = propertyPath[0]; // The top-level property
			log.warn(`WebView edit: Complex property edit for '${propertyPath.join(".")}' - requires parent reconstruction`);

			// TODO: Implement proper parent reconstruction for compound types
			// For now, try to set the leaf property directly
			if (useSceneTreeMonitor) {
				this.sceneTreeMonitor.setObjectProperty(BigInt(objectId), propertyPath[propertyPath.length - 1], newValue);
			} else {
				this.session?.controller.set_object_property(BigInt(objectId), propertyPath[propertyPath.length - 1], newValue);
			}
		}

		// Refresh the inspector to show updated values
		if (useSceneTreeMonitor) {
			this.sceneTreeMonitor.refreshInspector();
		} else {
			this.refresh_inspector();
		}

		// Refresh VSCode debug variables if session exists
		if (this.session) {
			this.session.sendEvent(new InvalidatedEvent(["variables"]));
		}
	}
}

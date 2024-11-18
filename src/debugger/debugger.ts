import * as fs from "fs";
import {
	debug,
	window,
	workspace,
	ExtensionContext,
	DebugConfigurationProvider,
	WorkspaceFolder,
	DebugAdapterInlineImplementation,
	DebugAdapterDescriptorFactory,
	DebugConfiguration,
	DebugAdapterDescriptor,
	DebugSession,
	CancellationToken,
	ProviderResult,
	FileDecoration,
	FileDecorationProvider,
	Uri,
	EventEmitter,
	Event,
} from "vscode";
import { DebugProtocol } from "@vscode/debugprotocol";
import { GodotDebugSession as Godot3DebugSession } from "./godot3/debug_session";
import { GodotDebugSession as Godot4DebugSession } from "./godot4/debug_session";
import { register_command, set_context, createLogger, get_project_version } from "../utils";
import { SceneTreeProvider, SceneNode } from "./scene_tree_provider";
import { InspectorProvider, RemoteProperty } from "./inspector_provider";

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

export class GodotDebugger implements DebugAdapterDescriptorFactory, DebugConfigurationProvider, FileDecorationProvider {
	public session?: Godot3DebugSession | Godot4DebugSession;
	public inspectorProvider = new InspectorProvider();
	public sceneTreeProvider = new SceneTreeProvider();

	private _onDidChangeFileDecorations = new EventEmitter<Uri>();
	get onDidChangeFileDecorations(): Event<Uri> {
		return this._onDidChangeFileDecorations.event;
	}

	constructor(private context: ExtensionContext) {
		log.info("Initializing Godot Debugger");

		this.restore_pinned_file();

		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot", this),
			debug.registerDebugAdapterDescriptorFactory("godot", this),
			window.registerTreeDataProvider("inspectNode", this.inspectorProvider),
			window.registerTreeDataProvider("activeSceneTree", this.sceneTreeProvider),
			window.registerFileDecorationProvider(this),
			register_command("debugger.inspectNode", this.inspect_node.bind(this)),
			register_command("debugger.refreshSceneTree", this.refresh_scene_tree.bind(this)),
			register_command("debugger.refreshInspector", this.refresh_inspector.bind(this)),
			register_command("debugger.editValue", this.edit_value.bind(this)),
			register_command("debugger.debugCurrentFile", this.debug_current_file.bind(this)),
			register_command("debugger.debugPinnedFile", this.debug_pinned_file.bind(this)),
			register_command("debugger.pinFile", this.pin_file.bind(this)),
			register_command("debugger.unpinFile", this.unpin_file.bind(this)),
			register_command("debugger.openPinnedFile", this.open_pinned_file.bind(this)),
		);
	}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "file") return undefined;
		if (pinnedScene && uri.fsPath === pinnedScene.fsPath) {
			return {
				badge: "🖈",
			};
		}
	}

	public async createDebugAdapterDescriptor(session: DebugSession): Promise<DebugAdapterDescriptor> {
		log.info("Creating debug session");
		const projectVersion = await get_project_version();
		log.info(`Project version identified as ${projectVersion}`);

		if (projectVersion.startsWith("4")) {
			this.session = new Godot4DebugSession();
		} else {
			this.session = new Godot3DebugSession();
		}
		this.context.subscriptions.push(this.session);

		this.session.sceneTree = this.sceneTreeProvider;
		return new DebugAdapterInlineImplementation(this.session);
	}

	public resolveDebugConfiguration(
		folder: WorkspaceFolder | undefined,
		config: DebugConfiguration,
		token?: CancellationToken
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
		const configs: DebugConfiguration[] = workspace.getConfiguration("launch", window.activeTextEditor.document.uri).get("configurations");
		const launches = configs.filter((c) => c.request === "launch");
		const currents = configs.filter((c) => c.scene === "current");

		let path = window.activeTextEditor.document.fileName;
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
		if (uri === undefined) {
			uri = window.activeTextEditor.document.uri;
		}
		log.info(`Pinning debug target file: '${uri.fsPath}'`);
		set_context("pinnedScene", [uri.fsPath]);
		if (pinnedScene) {
			this._onDidChangeFileDecorations.fire(pinnedScene);
		}
		pinnedScene = uri;
		this.context.workspaceState.update("pinnedScene", pinnedScene);
		this._onDidChangeFileDecorations.fire(uri);
	}

	public unpin_file(uri: Uri) {
		log.info(`Unpinning debug target file: '${pinnedScene}'`);
		set_context("pinnedScene", []);
		const previousPinnedScene = pinnedScene;
		pinnedScene = undefined;
		this.context.workspaceState.update("pinnedScene", pinnedScene);
		this._onDidChangeFileDecorations.fire(previousPinnedScene);
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

	public inspect_node(element: SceneNode | RemoteProperty) {
		this.session?.controller.request_inspect_object(BigInt(element.object_id));
		this.session?.inspect_callbacks.set(
			BigInt(element.object_id),
			(class_name, variable) => {
				this.inspectorProvider.fill_tree(
					element.label,
					class_name,
					element.object_id,
					variable
				);
			},
		);
	}

	public refresh_scene_tree() {
		this.session?.controller.request_scene_tree();
	}

	public refresh_inspector() {
		if (this.inspectorProvider.has_tree()) {
			const name = this.inspectorProvider.get_top_name();
			const id = this.inspectorProvider.get_top_id();

			this.session?.controller.request_inspect_object(BigInt(id));
			this.session?.inspect_callbacks.set(
				BigInt(id),
				(class_name, variable) => {
					this.inspectorProvider.fill_tree(
						name,
						class_name,
						id,
						variable
					);
				},
			);
		}
	}

	public edit_value(property: RemoteProperty) {
		const previous_value = property.value;
		const type = typeof previous_value;
		const is_float = type === "number" && !Number.isInteger(previous_value);
		window
			.showInputBox({ value: `${property.description}` })
			.then((value) => {
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
						if (
							value.toLowerCase() === "true" ||
							value.toLowerCase() === "false"
						) {
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
					const changed_value = this.inspectorProvider.get_changed_value(
						parents,
						property,
						new_parsed_value
					);
					this.session?.controller.set_object_property(
						BigInt(property.object_id),
						parents[idx].label,
						changed_value,
					);
				} else {
					this.session?.controller.set_object_property(
						BigInt(property.object_id),
						property.label,
						new_parsed_value,
					);
				}

				const name = this.inspectorProvider.get_top_name();
				const id = this.inspectorProvider.get_top_id();

				this.session?.controller.request_inspect_object(BigInt(id));
				this.session?.inspect_callbacks.set(
					BigInt(id),
					(class_name, variable) => {
						this.inspectorProvider.fill_tree(
							name,
							class_name,
							id,
							variable
						);
					},
				);
			});
	}
}

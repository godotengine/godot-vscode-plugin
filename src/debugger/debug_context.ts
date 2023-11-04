import {
	ExtensionContext,
	debug,
	DebugConfigurationProvider,
	WorkspaceFolder,
	DebugAdapterInlineImplementation,
	DebugAdapterDescriptorFactory,
	DebugConfiguration,
	DebugAdapterDescriptor,
	DebugSession,
	CancellationToken,
	ProviderResult,
} from "vscode";
import { GodotDebugSession as Godot3DebugSession } from "./godot3/debug_session";
import { GodotDebugSession as Godot4DebugSession } from "./godot4/debug_session";
import { projectVersion } from "../utils";
import { SceneTreeProvider } from "./scene_tree_provider";
import { createLogger } from "../logger";

const log = createLogger("debugger.context");

export class GodotDebugger implements DebugAdapterDescriptorFactory, DebugConfigurationProvider {
	public session?: Godot3DebugSession | Godot4DebugSession;

	constructor(
		private context: ExtensionContext,
		private sceneTreeProvider: SceneTreeProvider,
	) {
		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot", this),
			debug.registerDebugAdapterDescriptorFactory("godot", this),
		);
	}

	public createDebugAdapterDescriptor(session: DebugSession): ProviderResult<DebugAdapterDescriptor> {
		if (projectVersion.startsWith("4")) {
			this.session = new Godot4DebugSession();
		} else {
			this.session = new Godot3DebugSession();
		}
		this.context.subscriptions.push(this.session);

		this.session.scene_tree = this.sceneTreeProvider;
		return new DebugAdapterInlineImplementation(this.session);
	}

	public resolveDebugConfiguration(
		folder: WorkspaceFolder | undefined,
		config: DebugConfiguration,
		token?: CancellationToken
	): ProviderResult<DebugConfiguration> {
		// TODO: rewrite this
		// if (!config.type && !config.request && !config.name) {
		// 	const editor = window.activeTextEditor;
		// 	// TODO: this check is wrong
		// 	if (editor && fs.existsSync(`${folder.uri.fsPath}/project.godot`)) {
		// 		config.type = "godot";
		// 		config.name = "Debug Godot";
		// 		config.request = "launch";
		// 		config.project = "${workspaceFolder}";
		// 		config.port = 6007;
		// 		config.address = "127.0.0.1";
		// 		config.additional_options = "";
		// 	}
		// }

		// request is actually a required field according to vscode
		// however, setting it here lets us catch a possible user misconfiguration
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

		// TODO: rewrite this
		// if (config.request === "launch" && !config.project) {
		// 	return window
		// 		.showInformationMessage(
		// 			"Cannot find a project.godot in active workspace."
		// 		)
		// 		.then(() => {
		// 			return undefined;
		// 		});
		// }
		return config;
	}
}

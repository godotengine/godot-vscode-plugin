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
	window,
} from "vscode";
import { GodotDebugSession } from "./debug_session";
import fs = require("fs");
import { SceneTreeProvider } from "../scene_tree_provider";
import { Mediator } from "./mediator";

export class Godot4Debugger {
	public provider: GodotConfigurationProvider;
	public factory: GodotDebugAdapterFactory;
	public mediator: Mediator = Mediator;

	constructor(
		context: ExtensionContext, 
		scene_tree_provider: SceneTreeProvider,
	) {
		this.provider = new GodotConfigurationProvider();
		this.factory = new GodotDebugAdapterFactory(scene_tree_provider);

		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot4", this.provider),
			debug.registerDebugAdapterDescriptorFactory("godot4", this.factory),
		);

		context.subscriptions.push(this.factory);
	}
	
	public notify(event: string, parameters: any[] = []) {
		Mediator.notify(event, parameters);
	}
}

class GodotConfigurationProvider implements DebugConfigurationProvider {
	public resolveDebugConfiguration(
		folder: WorkspaceFolder | undefined,
		config: DebugConfiguration,
		token?: CancellationToken
	): ProviderResult<DebugConfiguration> {
		if (!config.type && !config.request && !config.name) {
			const editor = window.activeTextEditor;
			if (editor && fs.existsSync(`${folder.uri.fsPath}/project.godot`)) {
				config.type = "godot4";
				config.name = "Debug Godot";
				config.request = "launch";
				config.project = "${workspaceFolder}";
				config.port = 6007;
				config.address = "127.0.0.1";
				config.launch_game_instance = true;
				config.launch_scene = false;
				config.additional_options = "";
			}
		}

		if (!config.project) {
			return window
				.showInformationMessage(
					"Cannot find a project.godot in active workspace."
				)
				.then(() => {
					return undefined;
				});
		}

		return config;
	}
}

class GodotDebugAdapterFactory implements DebugAdapterDescriptorFactory {
	public session: GodotDebugSession | undefined;

	constructor(private scene_tree_provider: SceneTreeProvider) {}

	public createDebugAdapterDescriptor(
		session: DebugSession
	): ProviderResult<DebugAdapterDescriptor> {
		this.session = new GodotDebugSession();
		this.session.set_scene_tree(this.scene_tree_provider);
		return new DebugAdapterInlineImplementation(this.session);
	}

	public dispose() {
		this.session.dispose();
		this.session = undefined;
	}
}

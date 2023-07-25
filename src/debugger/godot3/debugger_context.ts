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
import { createLogger } from "../../logger";

const log = createLogger("debugger.context");

export class Godot3Debugger implements DebugAdapterDescriptorFactory {
	public provider: GodotConfigurationProvider;
	public session?: GodotDebugSession;

	constructor(
		context: ExtensionContext,
		private scene_tree_provider: SceneTreeProvider,
	) {
		this.provider = new GodotConfigurationProvider();

		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot3", this.provider),
			debug.registerDebugAdapterDescriptorFactory("godot3", this),
		);

		context.subscriptions.push(this);
	}

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

	public notify(event: string, parameters: any[] = []) {
		log.info(event, JSON.stringify(parameters));

		switch (event) {
			case "request_scene_tree":
				this.session?.controller.send_request_scene_tree_command();
				break;
			case "inspect_object":
				this.session?.controller.send_inspect_object_request(parameters[0]);
				if (parameters[1]) {
					this.session?.inspect_callbacks.set(Number(parameters[0]), parameters[1]);
				}
				break;
			case "continue":
				this.session?.controller.continue();
				break;
			case "next":
				this.session?.controller.next();
				break;
			case "step":
				this.session?.controller.step();
				break;
			case "step_out":
				this.session?.controller.step_out();
				break;
			default: {
				Mediator.notify(event, parameters);
				break;
			}
		}
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
				config.type = "godot3";
				config.name = "Debug Godot";
				config.request = "launch";
				config.project = "${workspaceFolder}";
				config.port = 6007;
				config.address = "127.0.0.1";
				config.additional_options = "";
			}
		}

		if (config.request === "launch") {
			if (config.address == undefined) {
				config.address = "127.0.0.1";
			}
			if (config.port == undefined) {
				config.port = 6007;
			}
		}

		if (config.request === "launch" && !config.project) {
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

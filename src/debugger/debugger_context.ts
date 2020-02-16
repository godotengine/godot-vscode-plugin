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
	OutputChannel
} from "vscode";
import { GodotDebugSession } from "./godot_debug";
import fs = require("fs");
import { VersionedTextDocumentIdentifier } from "vscode-languageclient";

export function register_debugger(context: ExtensionContext) {
	const PROVIDER = new GodotConfigurationProvider();
	context.subscriptions.push(
		debug.registerDebugConfigurationProvider("godot", PROVIDER)
	);

	let factory = new GodotDebugAdapterFactory();
	context.subscriptions.push(
		debug.registerDebugAdapterDescriptorFactory("godot", factory)
	);

	context.subscriptions.push(factory);
}

class GodotConfigurationProvider implements DebugConfigurationProvider {
	public resolveDebugConfiguration(
		folder: WorkspaceFolder | undefined,
		config: DebugConfiguration,
		token?: CancellationToken
	): ProviderResult<DebugConfiguration> {
		if (!config.type && !config.request && !config.name) {
			const editor = window.activeTextEditor;
			if (editor && fs.existsSync(`${folder}/project.godot`)) {
				config.type = "godot";
				config.name = "Debug Godot";
				config.request = "launch";
				config.project = "${workspaceFolder}";
				config.port = 6007;
				config.address = "127.0.0.1";
				config.launch_game_instance = true;
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
	private session: GodotDebugSession | undefined;

	public createDebugAdapterDescriptor(
		session: DebugSession
	): ProviderResult<DebugAdapterDescriptor> {
		this.session = new GodotDebugSession();
		return new DebugAdapterInlineImplementation(this.session);
	}

	public dispose() {
		this.session.dispose();
		this.session = undefined;
	}
}

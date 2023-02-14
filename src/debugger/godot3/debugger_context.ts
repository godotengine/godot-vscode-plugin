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
	commands,
} from "vscode";
import { GodotDebugSession } from "./debug_session";
import fs = require("fs");
import { SceneTreeProvider, SceneNode } from "./scene_tree/scene_tree_provider";
import {
	RemoteProperty,
	InspectorProvider,
} from "./scene_tree/inspector_provider";
import { Mediator } from "./mediator";

export function register_debugger(context: ExtensionContext) {
	let provider = new GodotConfigurationProvider();
	context.subscriptions.push(
		debug.registerDebugConfigurationProvider("godot", provider)
	);

	let inspector_provider = new InspectorProvider();
	window.registerTreeDataProvider("inspect-node", inspector_provider);

	let scene_tree_provider = new SceneTreeProvider();
	window.registerTreeDataProvider("active-scene-tree", scene_tree_provider);

	let factory = new GodotDebugAdapterFactory(scene_tree_provider);
	context.subscriptions.push(
		debug.registerDebugAdapterDescriptorFactory("godot", factory)
	);

	commands.registerCommand(
		"godotTools.debugger.inspectNode",
		(element: SceneNode | RemoteProperty) => {
			if (element instanceof SceneNode) {
				Mediator.notify("inspect_object", [
					element.object_id,
					(class_name, variable) => {
						inspector_provider.fill_tree(
							element.label,
							class_name,
							element.object_id,
							variable
						);
					},
				]);
			} else if (element instanceof RemoteProperty) {
				Mediator.notify("inspect_object", [
					element.object_id,
					(class_name, properties) => {
						inspector_provider.fill_tree(
							element.label,
							class_name,
							element.object_id,
							properties
						);
					},
				]);
			}
		}
	);

	commands.registerCommand("godotTools.debugger.refreshSceneTree", () => {
		Mediator.notify("request_scene_tree", []);
	});

	commands.registerCommand("godotTools.debugger.refreshInspector", () => {
		if (inspector_provider.has_tree()) {
			let name = inspector_provider.get_top_name();
			let id = inspector_provider.get_top_id();
			Mediator.notify("inspect_object", [
				id,
				(class_name, properties) => {
					inspector_provider.fill_tree(name, class_name, id, properties);
				},
			]);
		}
	});

	commands.registerCommand(
		"godotTools.debugger.editValue",
		(property: RemoteProperty) => {
			let previous_value = property.value;
			let type = typeof previous_value;
			let is_float = type === "number" && !Number.isInteger(previous_value);
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
								new_parsed_value = parseFloat(value);
								if (isNaN(new_parsed_value)) {
									return;
								}
							} else {
								new_parsed_value = parseInt(value);
								if (isNaN(new_parsed_value)) {
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
						let parents = [property.parent];
						let idx = 0;
						while (parents[idx].changes_parent) {
							parents.push(parents[idx++].parent);
						}
						let changed_value = inspector_provider.get_changed_value(
							parents,
							property,
							new_parsed_value
						);
						Mediator.notify("changed_value", [
							property.object_id,
							parents[idx].label,
							changed_value,
						]);
					} else {
						Mediator.notify("changed_value", [
							property.object_id,
							property.label,
							new_parsed_value,
						]);
					}

					Mediator.notify("inspect_object", [
						inspector_provider.get_top_id(),
						(class_name, properties) => {
							inspector_provider.fill_tree(
								inspector_provider.get_top_name(),
								class_name,
								inspector_provider.get_top_id(),
								properties
							);
						},
					]);
				});
		}
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
			if (editor && fs.existsSync(`${folder.uri.fsPath}/project.godot`)) {
				config.type = "godot";
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

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
	commands
} from "vscode";
import { GodotDebugSession } from "./godot_debug";
import fs = require("fs");
import { SceneTreeProvider, SceneNode } from "./SceneTree/scene_tree_provider";
import {
	InspectorProvider,
	RemoteProperty
} from "./SceneTree/inspector_provider";

export function register_debugger(context: ExtensionContext) {
	let provider = new GodotConfigurationProvider();
	context.subscriptions.push(
		debug.registerDebugConfigurationProvider("godot", provider)
	);

	let inspector_provider = new InspectorProvider();
	window.registerTreeDataProvider("inspect-node", inspector_provider);

	let scene_tree_provider = new SceneTreeProvider();
	window.registerTreeDataProvider("active-scene-tree", scene_tree_provider);

	let factory = new GodotDebugAdapterFactory(
		scene_tree_provider,
		inspector_provider
	);
	context.subscriptions.push(
		debug.registerDebugAdapterDescriptorFactory("godot", factory)
	);

	commands.registerCommand(
		"godot-tool.debugger.inspect_node",
		(element: SceneNode | RemoteProperty) => {
			if (element instanceof SceneNode) {
				factory.session.inspect_node(
					element.label,
					element.object_id,
					(class_name, properties) => {
						inspector_provider.fill_tree(
							element.label,
							class_name,
							element.object_id,
							properties
						);
					}
				);
			} else if (element instanceof RemoteProperty) {
				factory.session.inspect_node(
					element.label,
					element.value.id,
					(class_name, properties) => {
						inspector_provider.fill_tree(
							element.label,
							class_name,
							element.value.id,
							properties
						);
					}
				);
			}
		}
	);

	commands.registerCommand("godot-tool.debugger.refresh_scene_tree", () => {
		factory.session.request_scene_tree();
	});

	commands.registerCommand("godot-tool.debugger.refresh_inspector", () => {
		if (inspector_provider.has_tree()) {
			factory.session.reinspect_node((name, class_name, properties) => {
				inspector_provider.fill_tree(
					name,
					class_name,
					factory.session.get_last_id(),
					properties
				);
			});
		}
	});

	commands.registerCommand(
		"godot-tool.debugger.edit_value",
		(property: RemoteProperty) => {
			let previous_value = property.value;
			let type = typeof previous_value;
			let is_float = type === "number" && !Number.isInteger(previous_value);
			window.showInputBox({ value: `${property.description}` }).then(value => {
				let new_parsed_value: any;
				switch (type) {
					case "string":
						new_parsed_value = value;
						break;
					case "number":
						if (is_float) {
							new_parsed_value = parseFloat(value);
							if (new_parsed_value === NaN) {
								return;
							}
						} else {
							new_parsed_value = parseInt(value);
							if (new_parsed_value === NaN) {
								return;
							}
						}
						break;
					case "boolean":
						new_parsed_value = value.toLowerCase() === "true";
						break;
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
					factory.session.set_object_property(
						property.object_id,
						parents[idx].label,
						changed_value
					);
				} else {
					factory.session.set_object_property(
						property.object_id,
						property.label,
						new_parsed_value
					);
				}
				factory.session.reinspect_node((name, class_name, properties) => {
					inspector_provider.fill_tree(
						name,
						class_name,
						factory.session.get_last_id(),
						properties
					);
				});
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
	public session: GodotDebugSession | undefined;

	constructor(
		private tree_provider: SceneTreeProvider,
		private inspector_provider: InspectorProvider
	) {}

	public createDebugAdapterDescriptor(
		session: DebugSession
	): ProviderResult<DebugAdapterDescriptor> {
		this.session = new GodotDebugSession();
		this.inspector_provider.clean_up();
		this.session.set_tree_provider(this.tree_provider);
		return new DebugAdapterInlineImplementation(this.session);
	}

	public dispose() {
		this.session.dispose();
		this.session = undefined;
	}
}

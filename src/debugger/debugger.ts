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
	Uri
} from "vscode";
import { DebugProtocol } from "@vscode/debugprotocol";
import { GodotDebugSession as Godot3DebugSession } from "./godot3/debug_session";
import { GodotDebugSession as Godot4DebugSession } from "./godot4/debug_session";
import { register_command, projectVersion, set_context } from "../utils";
import { SceneTreeProvider, SceneNode } from "./scene_tree_provider";
import { InspectorProvider, RemoteProperty } from "./inspector_provider";

import { createLogger } from "../logger";

const log = createLogger("debugger");

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	address: string;
	port: number;
	project: string;
	scene_file: string;
	additional_options: string;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	address: string;
	port: number;
	project: string;
	scene_file: string;
	additional_options: string;
}

export class GodotDebugger implements DebugAdapterDescriptorFactory, DebugConfigurationProvider {
	public session?: Godot3DebugSession | Godot4DebugSession;
	public inspectorProvider = new InspectorProvider();
	public sceneTreeProvider = new SceneTreeProvider();
	public pinnedScene: Uri;

	constructor(private context: ExtensionContext) {
		context.subscriptions.push(
			debug.registerDebugConfigurationProvider("godot", this),
			debug.registerDebugAdapterDescriptorFactory("godot", this),
			window.registerTreeDataProvider("inspectNode", this.inspectorProvider),
			window.registerTreeDataProvider("activeSceneTree", this.sceneTreeProvider),
			register_command("debugger.inspectNode", this.inspect_node.bind(this)),
			register_command("debugger.refreshSceneTree", this.refresh_scene_tree.bind(this)),
			register_command("debugger.refreshInspector", this.refresh_inspector.bind(this)),
			register_command("debugger.editValue", this.edit_value.bind(this)),
			register_command("debugger.debugCurrentFile", this.debug_file.bind(this)),
			register_command("debugger.debugPinnedFile", this.debug_pinned_file.bind(this)),
			register_command("debugger.pinFile", this.pin_file.bind(this)),
			register_command("debugger.unpinFile", this.unpin_file.bind(this)),
		);
	}

	public createDebugAdapterDescriptor(session: DebugSession): ProviderResult<DebugAdapterDescriptor> {
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

	public debug_file(uri: Uri) {
		const folder = workspace.workspaceFolders[0];
		let path = uri.fsPath;
		if (path.endsWith(".gd")) {
			path = path.replace(".gd", ".tscn");
		}

		if (!fs.existsSync(path)) {
			window.showErrorMessage(`Can't find associated scene file for ${path}`, "Ok");
			return;
		}

		const configs: DebugConfiguration[] = workspace.getConfiguration("launch").get("configurations");
		let config = configs.filter((c) => c.request === "launch")[0];
		if (!config) {
			config = {
				name: `Debug ${path} : 'File'}`,
				type: "godot",
				request: "launch"
			};
		}
		config.scene_file = path;
		debug.startDebugging(folder, config);
	}

	public debug_pinned_file() {
		if (this.pinnedScene) {
			this.debug_file(this.pinnedScene);
		}

	}

	public pin_file(uri: Uri) {
		set_context("pinnedScene", [uri.fsPath]);
		this.pinnedScene = uri;
	}

	public unpin_file(uri: Uri) {
		set_context("pinnedScene", []);
		this.pinnedScene = undefined;
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

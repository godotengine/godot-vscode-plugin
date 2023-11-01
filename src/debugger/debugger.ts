import { ExtensionContext, window, commands } from "vscode";
import { SceneTreeProvider, SceneNode } from "./scene_tree_provider";
import { InspectorProvider, RemoteProperty } from "./inspector_provider";
import { GodotDebugger } from "./debug_context";

import { createLogger } from "../logger";

const log = createLogger("debugger");

export class GodotDebugManager {
	public inspectorProvider = new InspectorProvider();
	public sceneTreeProvider = new SceneTreeProvider();
	public debugger: GodotDebugger;

	constructor(context: ExtensionContext) {
		window.registerTreeDataProvider("inspectNode", this.inspectorProvider);
		window.registerTreeDataProvider("activeSceneTree", this.sceneTreeProvider);

		this.debugger = new GodotDebugger(context, this.sceneTreeProvider);

		context.subscriptions.push(
			this.debugger,
			commands.registerCommand("godotTools.debugger.inspectNode", this.inspectNode.bind(this)),
			commands.registerCommand("godotTools.debugger.refreshSceneTree", this.refreshSceneTree.bind(this)),
			commands.registerCommand("godotTools.debugger.refreshInspector", this.refreshInspector.bind(this)),
			commands.registerCommand("godotTools.debugger.editValue", this.editValue.bind(this)),
		);
	}

	public inspectNode(element: SceneNode | RemoteProperty) {
		this.debugger.session?.controller.request_inspect_object(BigInt(element.object_id));
		this.debugger.session?.inspect_callbacks.set(
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

	public refreshSceneTree() {
		this.debugger.session?.controller.request_scene_tree();
	}

	public refreshInspector() {
		if (this.inspectorProvider.has_tree()) {
			const name = this.inspectorProvider.get_top_name();
			const id = this.inspectorProvider.get_top_id();

			this.debugger.session?.controller.request_inspect_object(BigInt(id));
			this.debugger.session?.inspect_callbacks.set(
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

	public editValue(property: RemoteProperty) {
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
					this.debugger.session?.controller.set_object_property(
						BigInt(property.object_id),
						parents[idx].label,
						changed_value,
					);
				} else {
					this.debugger.session?.controller.set_object_property(
						BigInt(property.object_id),
						property.label,
						new_parsed_value,
					);
				}

				const name = this.inspectorProvider.get_top_name();
				const id = this.inspectorProvider.get_top_id();

				this.debugger.session?.controller.request_inspect_object(BigInt(id));
				this.debugger.session?.inspect_callbacks.set(
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

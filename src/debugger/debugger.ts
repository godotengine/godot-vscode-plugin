import { ExtensionContext, window, commands } from "vscode";
import { SceneTreeProvider, SceneNode } from "./scene_tree_provider";
import { InspectorProvider, RemoteProperty } from "./inspector_provider";
import { Godot3Debugger } from "./godot3/debugger_context";
import { Godot4Debugger } from "./godot4/debugger_context";


export class GodotDebugManager {
	public inspectorProvider = new InspectorProvider();
	public sceneTreeProvider = new SceneTreeProvider();
	public g3: Godot3Debugger;
	public g4: Godot4Debugger;

	constructor(context: ExtensionContext) {
		window.registerTreeDataProvider("inspect-node", this.inspectorProvider);
		window.registerTreeDataProvider("active-scene-tree", this.sceneTreeProvider);

		commands.registerCommand("godotTools.debugger.inspectNode", this.inspectNode.bind(this));
		commands.registerCommand("godotTools.debugger.refreshSceneTree", this.refreshSceneTree.bind(this));
		commands.registerCommand("godotTools.debugger.refreshInspector", this.refreshInspector.bind(this));
		commands.registerCommand("godotTools.debugger.editValue", this.editValue.bind(this));

		this.g3 = new Godot3Debugger(context, this.sceneTreeProvider);
		this.g4 = new Godot4Debugger(context, this.sceneTreeProvider);
	}

	public notify(event: string, parameters: any[] = []) {
		if (this.g3.factory.session) {
			console.log('notifying g3');
			this.g3.notify(event, parameters);
		}
		if (this.g4.factory.session) {
			console.log('notifying g4');
			this.g4.notify(event, parameters);
		}
	}

	public inspectNode(element: SceneNode | RemoteProperty) {
		if (element instanceof SceneNode) {
			this.notify("inspect_object", [
				element.object_id,
				(class_name, variable) => {
					this.inspectorProvider.fill_tree(
						element.label,
						class_name,
						element.object_id,
						variable
					);
				},
			]);
		} else if (element instanceof RemoteProperty) {
			this.notify("inspect_object", [
				element.object_id,
				(class_name, properties) => {
					this.inspectorProvider.fill_tree(
						element.label,
						class_name,
						element.object_id,
						properties
					);
				},
			]);
		}
	}

	public refreshSceneTree() {
		this.notify("request_scene_tree", []);
	}

	public refreshInspector() {
		if (this.inspectorProvider.has_tree()) {
			let name = this.inspectorProvider.get_top_name();
			let id = this.inspectorProvider.get_top_id();
			this.notify("inspect_object", [
				id,
				(class_name, properties) => {
					this.inspectorProvider.fill_tree(name, class_name, id, properties);
				},
			]);
		}
	}

	public editValue(property: RemoteProperty) {
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
					let changed_value = this.inspectorProvider.get_changed_value(
						parents,
						property,
						new_parsed_value
					);
					this.notify("changed_value", [
						property.object_id,
						parents[idx].label,
						changed_value,
					]);
				} else {
					this.notify("changed_value", [
						property.object_id,
						property.label,
						new_parsed_value,
					]);
				}

				this.notify("inspect_object", [
					this.inspectorProvider.get_top_id(),
					(class_name, properties) => {
						this.inspectorProvider.fill_tree(
							this.inspectorProvider.get_top_name(),
							class_name,
							this.inspectorProvider.get_top_id(),
							properties
						);
					},
				]);
			});
	}
}

import { ExtensionContext } from "vscode";
import { GodotTools } from "./godot-tools";

let tools: GodotTools = null;

export function activate(context: ExtensionContext) {
	tools = new GodotTools(context);
	tools.activate();
}

export function deactivate(): Thenable<void> {
	return new Promise((resolve, reject) => {
		tools.deactivate();
		resolve();
	});
}

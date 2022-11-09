import { ExtensionContext } from "vscode";
import { GodotTools } from "./godot-tools";
import { shouldUpdateSettings, updateOldStyleSettings, updateStoredVersion } from "./settings_updater";
import debuggerContext = require("./debugger/debugger_context");

let tools: GodotTools = null;

export function activate(context: ExtensionContext) {
	if (shouldUpdateSettings(context)) {
		updateOldStyleSettings();
	}
	updateStoredVersion(context);

	tools = new GodotTools(context);
	tools.activate();
	debuggerContext.register_debugger(context);
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		tools.deactivate();
		resolve();
	});
}

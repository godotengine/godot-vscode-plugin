import { ExtensionContext, extensions, window } from "vscode";
import { GodotTools } from "./godot-tools";
import debuggerContext = require("./debugger/debugger_context");

let tools: GodotTools = null;

export function showUpdateMessage(context: ExtensionContext) {
	const localVersion: string | undefined =
		context.globalState.get("previousVersion");
	const syncedVersion: string = extensions.getExtension(context.extension.id)!
		.packageJSON.version;

	// Store the current version of the extension, this persists across reloads & updates.
	context.globalState.update("previousVersion", syncedVersion);

	if (localVersion !== syncedVersion && syncedVersion.startsWith("2.")) {
		if (localVersion === undefined || localVersion.startsWith("1.")) {
			window.showInformationMessage(
				`Version 2.0.0 of the Godot Tools extension renames various settings.
				Please view the changelog for a full list, you will need to update any settings you have configured.`,
				"OK"
			);
		}
	}
}

export function activate(context: ExtensionContext) {
	showUpdateMessage(context);

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

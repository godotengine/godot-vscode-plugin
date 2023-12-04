import * as vscode from "vscode";

const OLD_SETTINGS_CONVERSIONS = [
	["godot_tools.editor_path", "godotTools.editorPath.godot3"],
	["godot_tools.editor_path", "godotTools.editorPath.godot4"],
	["godot_tools.gdscript_lsp_server_protocol", "godotTools.lsp.serverProtocol"],
	["godot_tools.gdscript_lsp_server_host", "godotTools.lsp.serverHost"],
	["godot_tools.gdscript_lsp_server_port", "godotTools.lsp.serverPort"],
	["godot_tools.reconnect_automatically", "godotTools.lsp.autoReconnect.enabled"],
	["godot_tools.reconnect_cooldown", "godotTools.lsp.autoReconnect.cooldown"],
	["godot_tools.reconnect_attempts", "godotTools.lsp.autoReconnect.attempts"],
	["godot_tools.scenePreview.previewRelatedScenes", "godotTools.scenePreview.previewRelatedScenes"]
];

export function updateOldStyleSettings() {
	const configuration = vscode.workspace.getConfiguration();
	let settings_changed = false;
	for (const [old_style_key, new_style_key] of OLD_SETTINGS_CONVERSIONS) {
		const value = configuration.get(old_style_key);
		if (value === undefined) {
			continue;
		}
		configuration.update(new_style_key, value, true);
		settings_changed = true;
	}
	if (settings_changed) {
		// Only show this message if things have actually changed, to prevent users who
		// are just reinstalling the extension from receiveing it.
		vscode.window.showInformationMessage(
			`Settings from godot-tools version <2.0.0 have been updated to the new format.
			Please view the changelog for version 2.0.0 for more information.`,
			"Okay"
		);
	}
}

/**
 * Stores the current version of the extension to `context.globalState`,
 * which persists across restarts & updates.
 */
export function updateStoredVersion(context: vscode.ExtensionContext) {
	const syncedVersion: string = vscode.extensions.getExtension(context.extension.id)
		.packageJSON.version;
	context.globalState.update("previousVersion", syncedVersion);
}

/**
 * Checks if settings should try and be converted from the <2.0.0 style.
 *
 * Returns `true` if the extension has no value saved for `localVersion`
 * in `context.globalState`, meaning it was either just installed,
 *  or updated from a version <2.0.0. Otherwise, returns `false`.
 */
export function shouldUpdateSettings(context: vscode.ExtensionContext): boolean {
	const localVersion: string | undefined = context.globalState.get("previousVersion");
	return localVersion === undefined;
}

export function attemptSettingsUpdate(context: vscode.ExtensionContext) {
	if (shouldUpdateSettings(context)) {
		updateOldStyleSettings();
	}
	updateStoredVersion(context);
}

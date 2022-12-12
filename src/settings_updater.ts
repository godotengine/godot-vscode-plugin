import * as vscode from "vscode";

const OLD_SETTINGS_CONVERSIONS = [
    ["godot_tools.gdscript_lsp_server_protocol", "godot-tools.lsp.serverProtocol"],
    ["godot_tools.gdscript_lsp_server_host", "godot-tools.lsp.serverHost"],
    ["godot_tools.gdscript_lsp_server_port", "godot-tools.lsp.serverPort"],
    ["godot_tools.editor_path", "godot-tools.editorPath"],
    ["godot_tools.scene_file_config", "godot-tools.sceneFileConfig"],
    ["godot_tools.reconnect_automatically", "godot-tools.lsp.autoReconnect.enabled"],
    ["godot_tools.reconnect_cooldown", "godot-tools.lsp.autoReconnect.cooldown"],
    ["godot_tools.reconnect_attempts", "godot-tools.lsp.autoReconnect.attempts"],
    ["godot_tools.force_visible_collision_shapes", "godot-tools.forceVisibleCollisionShapes"],
    ["godot_tools.force_visible_nav_mesh", "godot-tools.forceVisibleNavMesh"],
    ["godot_tools.native_symbol_placement", "godot-tools.nativeSymbolPlacement"],
    ["godot_tools.scenePreview.previewRelatedScenes", "godot-tools.scenePreview.previewRelatedScenes"]
];

export function updateOldStyleSettings() {
	let configuration = vscode.workspace.getConfiguration();
	let settings_changed = false;
	for (let [old_style_key, new_style_key] of OLD_SETTINGS_CONVERSIONS) {
		let value = configuration.get(old_style_key);
		if (value === undefined) {
			continue;
		}
		configuration.update(old_style_key, undefined, true);
		configuration.update(new_style_key, value, true);
		settings_changed = true;
	}
	if (settings_changed) {
		// Only show this message if things have actually changed, to prevent users who
		// are just reinstalling the extension from receiveing it.
		vscode.window.showInformationMessage(
			`Settings from godot-tools version <1.5.0 have been updated to the new format.
			Please view the changelog for version 1.5.0 for more information.`,
            'Okay'
		);
	}
}

/**
 * Stores the current version of the extension to `context.globalState`,
 * which persists across restarts & updates.
 */
export function updateStoredVersion(context: vscode.ExtensionContext) {
	const syncedVersion: string = vscode.extensions.getExtension(context.extension.id)!
		.packageJSON.version;
	context.globalState.update("previousVersion", syncedVersion);
}

/**
 * Checks if settings should try and be converted from the <1.5.0 style.
 *
 * Returns `true` if the extension has no value saved for `localVersion`
 * in `context.globalState`, meaning it was either just installed,
 *  or updated from a version <1.5.0. Otherwise, returns `false`.
 */
export function shouldUpdateSettings(context: vscode.ExtensionContext) : boolean {
    const localVersion: string | undefined = context.globalState.get("previousVersion");
    return localVersion === undefined;
}

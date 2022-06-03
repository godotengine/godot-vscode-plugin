import * as vscode from "vscode";

const CONFIG_CONTAINER = "godot-tools";

export function get_configuration(name: string, default_value: any = null) {
	let config_value = vscode.workspace.getConfiguration(CONFIG_CONTAINER).get(name, null);
	if (config_value === null) {
		return default_value;
	}
	return config_value;
}

export function set_configuration(name: string, value: any) {
	return vscode.workspace.getConfiguration(CONFIG_CONTAINER).update(name, value);
}

export function is_debug_mode(): boolean {
	return process.env.VSCODE_DEBUG_MODE === "true";
}

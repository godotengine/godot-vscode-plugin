import { workspace } from "vscode";

export function get_configuration(name: string, default_value: any = null) {
	return workspace.getConfiguration("godot_tools").get(name, default_value);
}

export function is_debug_mode(): boolean {
	return process.env.VSCODE_DEBUG_MODE === "true";
}

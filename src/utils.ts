import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const CONFIG_CONTAINER = "godot_tools";

export function get_configuration(name: string, default_value: any = null) {
	return vscode.workspace.getConfiguration(CONFIG_CONTAINER).get(name, default_value) || default_value;
}

export function set_configuration(name: string, value: any) {
	return vscode.workspace.getConfiguration(CONFIG_CONTAINER).update(name, value);
}

export function is_debug_mode(): boolean {
	return process.env.VSCODE_DEBUG_MODE === "true";
}

export function set_context(name: string, value: any) {
	vscode.commands.executeCommand("setContext", name, value);
}

export async function find_file(file: string): Promise<vscode.Uri|null> {
	if (fs.existsSync(file)) {
		return vscode.Uri.file(file);
	} else {
		const fileName = path.basename(file);
		const results = await vscode.workspace.findFiles("**/" + fileName);
		if (results.length == 1) {
			return results[0];
		}
	}
	return null;
}

export async function convert_resource_path_to_uri(resPath: string): Promise<vscode.Uri|null> {
	const files = await vscode.workspace.findFiles("**/project.godot");
	if (!files) {
		return null;
	}
	const project_dir = files[0].fsPath.replace("project.godot", "");
	return vscode.Uri.joinPath(vscode.Uri.file(project_dir), resPath.substring(6));
}
export async function get_config_version() {
	const [configFile] = await vscode.workspace.findFiles("**/project.godot");
	const configData = fs.readFileSync(configFile.fsPath, "utf-8");
	const lines = configData.split("\n");
	const configVersionLine = lines.find((line) =>
		line.startsWith("config_version=")
	);
	const configVersion = configVersionLine.split("=")[1];
	return parseInt(configVersion);
}
export async function get_godot_version() {
	// Find godot config
	const configVersion = await get_config_version();
	if (configVersion >= 5) { // godot 4 uses config version 5
		return 4;
	}
	return 3;
}

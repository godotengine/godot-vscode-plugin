import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const CONFIG_CONTAINER = "godotTools";

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

export function set_context(name: string, value: any) {
	vscode.commands.executeCommand("setContext", name, value);
}

export function find_project_file(start: string, depth:number=20) {
    // This function appears to be fast enough, but if speed is ever an issue,
    // memoizing the result should be straightforward
    const folder = path.dirname(start);
    if (start == folder) {
        return null;
    }
    const project_file = path.join(folder, "project.godot");

    if (fs.existsSync(project_file)) {
        return project_file;
    } else {
        if (depth === 0) { 
            return null;
        }
        return find_project_file(folder, depth - 1);
    }
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

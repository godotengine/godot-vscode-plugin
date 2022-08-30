import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';

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

export async function find_file(file: string): Promise<vscode.Uri|null> {
    if (fs.existsSync(file)) {
        return vscode.Uri.file(file);
    } else {
        const fileName = path.basename(file);
        const results = await vscode.workspace.findFiles('**/' + fileName);
        if (results.length == 1) {
            return results[0];
        }
    }
    return null;
}

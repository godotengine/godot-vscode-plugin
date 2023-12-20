import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export let projectDir = undefined;

export async function get_project_dir() {
	let dir = undefined;
	let projectFile = "";
	if (vscode.workspace.workspaceFolders != undefined) {
		const files = await vscode.workspace.findFiles("**/project.godot");
		if (files[0]) {
			projectFile = files[0].fsPath;
			if (fs.existsSync(projectFile) && fs.statSync(projectFile).isFile()) {
				dir = path.dirname(projectFile);
			}
		}
	}
	projectDir = dir;
	return dir;
}

export let projectVersion = undefined;

export async function get_project_version(): Promise<string | undefined> {
	const dir = await get_project_dir();

	if (!dir) {
		projectVersion = undefined;
		return undefined;
	}

	let godotVersion = "3.x";
	const projectFile = vscode.Uri.file(path.join(dir, "project.godot"));
	const document = await vscode.workspace.openTextDocument(projectFile);
	const text = document.getText();

	const match = text.match(/config\/features=PackedStringArray\((.*)\)/);
	if (match) {
		const line = match[0];
		const version = line.match(/\"(4.[0-9]+)\"/);
		if (version) {
			godotVersion = version[1];
		}
	}

	projectVersion = godotVersion;
	return godotVersion;
}

export function find_project_file(start: string, depth: number = 20) {
	// TODO: rename this, it's actually more like "find_parent_project_file"
	// This function appears to be fast enough, but if speed is ever an issue,
	// memoizing the result should be straightforward
	const folder = path.dirname(start);
	if (start == folder) {
		return null;
	}
	const projectFile = path.join(folder, "project.godot");

	if (fs.existsSync(projectFile) && fs.statSync(projectFile).isFile()) {
		return projectFile;
	} else {
		if (depth === 0) {
			return null;
		}
		return find_project_file(folder, depth - 1);
	}
}

export async function convert_resource_path_to_uri(resPath: string): Promise<vscode.Uri | null> {
	const files = await vscode.workspace.findFiles("**/project.godot");
	if (!files || files[0] === undefined) {
		return null;
	}
	const dir = files[0].fsPath.replace("project.godot", "");
	return vscode.Uri.joinPath(vscode.Uri.file(dir), resPath.substring(6));
}

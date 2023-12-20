import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

export let projectDir = undefined;
export let projectFile = undefined;

export async function get_project_dir() {
	let file = "";
	if (vscode.workspace.workspaceFolders != undefined) {
		const files = await vscode.workspace.findFiles("**/project.godot");
		if (files[0]) {
			file = files[0].fsPath;
			if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
				return;
			}
		}
	}
	projectFile = file;
	projectDir = path.dirname(file);
}

export let projectVersion = undefined;

export async function get_project_version(): Promise<string | undefined> {
	let godotVersion = "3.x";
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

type VERIFY_STATUS = "SUCCESS" | "WRONG_VERSION" | "INVALID_EXE";
type VERIFY_RESULT = {
	status: VERIFY_STATUS,
	version?: string,
}

export function verify_godot_version(godotPath: string, expectedVersion: "3" | "4"): VERIFY_RESULT {
	try {
		const output = execSync(`${godotPath} -h`).toString().trim();
		const pattern = /^Godot Engine v(([34])\.([0-9]+)(?:\.[0-9]+)?)/;
		const match = output.match(pattern);
		if (!match) {
			return { status: "INVALID_EXE" };
		}
		if (match[2] !== expectedVersion) {
			return { status: "WRONG_VERSION", version: match[1] };
		}
		return { status: "SUCCESS", version: match[1] };
	} catch {
		return { status: "INVALID_EXE" };
	}
}

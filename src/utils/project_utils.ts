import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execSync } from "child_process";
import { get_configuration } from "./vscode_utils";

let projectDir: string | undefined = undefined;
let projectFile: string | undefined = undefined;

export async function get_project_dir(): Promise<string | undefined> {
	let file = "";
	if (vscode.workspace.workspaceFolders !== undefined) {
		const files = await vscode.workspace.findFiles("**/project.godot", null);

		if (files.length === 0) {
			return undefined;
		}
		if (files.length === 1) {
			file = files[0].fsPath;
			if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
				return undefined;
			}
		} else if (files.length > 1) {
			// if multiple project files, pick the top-most one
			const best = files.reduce((a, b) => (a.fsPath.length <= b.fsPath.length ? a : b));
			if (best) {
				file = best.fsPath;
				if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
					return undefined;
				}
			}
		}
	}
	projectFile = file;
	projectDir = path.dirname(file);
	return projectDir;
}

export async function get_project_file(): Promise<string | undefined> {
	if (projectDir === undefined || projectFile === undefined) {
		await get_project_dir();
	}
	return projectFile;
}

let projectVersion: string | undefined = undefined;

export async function get_project_version(): Promise<string | undefined> {
	if (projectDir === undefined || projectFile === undefined) {
		await get_project_dir();
	}

	if (projectFile === undefined) {
		return undefined;
	}

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
	return projectVersion;
}

export function find_project_file(start: string, depth = 20) {
	// TODO: rename this, it's actually more like "find_parent_project_file"
	// This function appears to be fast enough, but if speed is ever an issue,
	// memoizing the result should be straightforward
	if (start === ".") {
		if (fs.existsSync("project.godot") && fs.statSync("project.godot").isFile()) {
			return "project.godot";
		}
		return null;
	}
	const folder = path.dirname(start);
	if (start === folder) {
		return null;
	}
	const projFile = path.join(folder, "project.godot");

	if (fs.existsSync(projFile) && fs.statSync(projFile).isFile()) {
		return projFile;
	}
	if (depth === 0) {
		return null;
	}
	return find_project_file(folder, depth - 1);
}

export async function convert_resource_path_to_uri(resPath: string): Promise<vscode.Uri | null> {
	const dir = await get_project_dir();
	return vscode.Uri.joinPath(vscode.Uri.file(dir), resPath.substring("res://".length));
}

type VERIFY_STATUS = "SUCCESS" | "WRONG_VERSION" | "INVALID_EXE";
type VERIFY_RESULT = {
	status: VERIFY_STATUS;
	version?: string;
};

export function verify_godot_version(godotPath: string, expectedVersion: "3" | "4" | string): VERIFY_RESULT {
	try {
		if (os.platform() === 'darwin' && godotPath.endsWith('.app')) {
			godotPath = path.join(godotPath, 'Contents', 'MacOS', 'Godot');
		}

		const output = execSync(`"${godotPath}" --version`).toString().trim();
		const pattern = /^(([34])\.([0-9]+)(?:\.[0-9]+)?)/m;
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

export function clean_godot_path(godotPath: string): string {
	const cleanPath = godotPath.replace(/^"/, "").replace(/"$/, "");
	const resolvedPath = resolve_workspace_relative_path(cleanPath);
	return resolvedPath;
}

function resolve_workspace_relative_path(target: string) {
	if (!fs.existsSync(target)) {
		const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		return path.resolve(workspacePath, target);
	}
	return target;
}

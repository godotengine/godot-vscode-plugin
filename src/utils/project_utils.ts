import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";

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
    if (os.platform() === "win32") {
        // capitalize the drive letter in windows absolute paths
        projectDir = projectDir[0].toUpperCase() + projectDir.slice(1);
    }
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

export type VERIFY_STATUS = "SUCCESS" | "WRONG_VERSION" | "INVALID_EXE";
export type VERIFY_RESULT = {
	status: VERIFY_STATUS;
	godotPath: string;
	version?: string;
};

export function verify_godot_version(godotPath: string, expectedVersion: "3" | "4" | string): VERIFY_RESULT {
	let target = clean_godot_path(godotPath);

	let output = "";
	try {
		output = execSync(`"${target}" --version`).toString().trim();
	} catch {
		if (path.isAbsolute(target)) {
			return { status: "INVALID_EXE", godotPath: target };
		}
		const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		target = path.resolve(workspacePath, target);
		try {
			output = execSync(`"${target}" --version`).toString().trim();
		} catch {
			return { status: "INVALID_EXE", godotPath: target };
		}
	}

	const pattern = /^(([34])\.([0-9]+)(?:\.[0-9]+)?)/m;
	const match = output.match(pattern);
	if (!match) {
		return { status: "INVALID_EXE", godotPath: target };
	}
	if (match[2] !== expectedVersion) {
		return { status: "WRONG_VERSION", godotPath: target, version: match[1] };
	}
	return { status: "SUCCESS", godotPath: target, version: match[1] };
}

export function clean_godot_path(godotPath: string): string {
	let target = godotPath.replace(/^"/, "").replace(/"$/, "");

	if (os.platform() === "darwin" && target.endsWith(".app")) {
		target = path.join(target, "Contents", "MacOS", "Godot");
	}

	return target;
}

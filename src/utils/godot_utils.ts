import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";

export function get_editor_data_dir(): string {
	// from: https://stackoverflow.com/a/26227660
	const appdata =
		process.env.APPDATA ||
		(process.platform === "darwin"
			? `${process.env.HOME}/Library/Preferences`
			: `${process.env.HOME}/.local/share`);

	return path.join(appdata, "Godot");
}

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

export async function convert_uri_to_resource_path(uri: vscode.Uri): Promise<string | null> {
	const project_dir = path.dirname(find_project_file(uri.fsPath));
	if (project_dir === null) {
		return;
	}

	let relative_path = path.normalize(path.relative(project_dir, uri.fsPath));
	relative_path = relative_path.split(path.sep).join(path.posix.sep);
	return `res://${relative_path}`;
}

const uidCache: Map<string, vscode.Uri | null> = new Map();

export async function convert_uids_to_uris(uids: string[]): Promise<Map<string, vscode.Uri>> {
	const not_found_uids: string[] = [];
	const uris: Map<string, vscode.Uri> = new Map();

	let found_all: boolean = true;
	for (const uid of uids) {
		if (!uid.startsWith("uid://")) {
			continue;
		}

		if (uidCache.has(uid)) {
			const uri = uidCache.get(uid);
			if (fs.existsSync(uri.fsPath)) {
				uris.set(uid, uri);
				continue;
			}

			uidCache.delete(uid);
		}

		found_all = false;
		not_found_uids.push(uid);
	}

	if (found_all) {
		return uris;
	}

	const files = await vscode.workspace.findFiles("**/*.uid", null);

	for (const file of files) {
		const document = await vscode.workspace.openTextDocument(file);
		const text = document.getText();
		const match = text.match(/uid:\/\/([0-9a-z]*)/);
		if (!match) {
			continue;
		}

		const found_match = not_found_uids.indexOf(match[0]) >= 0;

		const file_path = file.fsPath.substring(0, file.fsPath.length - ".uid".length);
		if (!fs.existsSync(file_path)) {
			continue;
		}

		const file_uri = vscode.Uri.file(file_path);
		uidCache.set(match[0], file_uri);

		if (found_match) {
			uris.set(match[0], file_uri);
		}
	}

	return uris;
}

export async function convert_uid_to_uri(uid: string): Promise<vscode.Uri | undefined> {
	const uris = await convert_uids_to_uris([uid]);
	return uris.get(uid);
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
	let pathToClean: string = godotPath;

	// Environment variable check 
	// Regular expression for variable value (between the variable suffix and the next ending curly bracket):
	// .+? matches any character (except line terminators) between one and unlimited times,
	// as few times as possible, expanding as needed (lazy)
	const varValueRegexp: string = ".+?";
	const pattern = `\\$\\{env:(${varValueRegexp})\\}`;
	const match = godotPath.match(pattern);

	if (match && match.length >= 2)	{
		pathToClean = process.env[match[1]];
	}

	let target = pathToClean.replace(/^"/, "").replace(/"$/, "");

	if (os.platform() === "darwin" && target.endsWith(".app")) {
		target = path.join(target, "Contents", "MacOS", "Godot");
	}

	return target;
}

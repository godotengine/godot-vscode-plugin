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
	if (projectDir && projectFile) {
		return projectDir;
	}

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
let projectUsesCSharp: boolean | undefined = undefined;

export async function get_project_version(): Promise<string | undefined> {
	if (projectVersion) {
		return projectVersion;
	}

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
		// Extract version number matching regex('\d+\.\d+')
		const versionMatch = line.match(/"(\d+\.\d+)"/);
		if (versionMatch) {
			godotVersion = versionMatch[1];
		}
		// Check if C# feature is present
		projectUsesCSharp = line.includes('"C#"');
	}

	projectVersion = godotVersion;
	return projectVersion;
}

export async function get_project_uses_csharp(): Promise<boolean | undefined> {
	if (projectUsesCSharp !== undefined) {
		return projectUsesCSharp;
	}

	// Force parsing if not yet done
	await get_project_version();
	return projectUsesCSharp;
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

	let found_all = true;
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

export type COMPATIBLE_RESULT = {
	status: "FOUND" | "NOT_FOUND";
	godotPath: string | undefined;
	version?: string;
	isMono?: boolean;
};

export type GodotExecutableInfo = {
	path: string;
	version: string;
	isMono: boolean;
};

/**
 * Queries a Godot executable for its version and whether it's a Mono version.
 * @param godotPath Path to the Godot executable
 * @returns Object with version and isMono properties, or null if invalid
 */
export async function query_godot_executable(godotPath: string): Promise<GodotExecutableInfo | null> {
	const target = clean_godot_path(godotPath);

	try {
		const output = execSync(`"${target}" --version`).toString().trim();
		
		// Parse version: e.g., "4.3.stable.mono" or "4.3.stable"
		const versionPattern = /^(([34])\.([0-9]+)(?:\.[0-9]+)?)/m;
		const versionMatch = output.match(versionPattern);
		
		if (!versionMatch) {
			return null;
		}

		const version = versionMatch[1];
		
		// Check if it's a mono version
		const isMono = output.toLowerCase().includes("mono");

		return {
			path: target,
			version: version,
			isMono: isMono
		};
	} catch {
		return null;
	}
}

/**
 * Finds a compatible Godot executable from an array of paths.
 * Chooses the first executable that strictly matches the project requirements.
 * @param executablePaths Array of paths to Godot executables
 * @param projectVersion The required major version (e.g., "3" or "4")
 * @param projectVersionMinor Optional minor version requirement (e.g., "4.3")
 * @param requiresMono Whether the project requires a Mono version
 * @returns COMPATIBLE_RESULT with the selected executable or NOT_FOUND status
 */
export async function find_compatible_godot_executable(
	executablePaths: string[],
	projectVersion: string,
	projectVersionMinor?: string,
	requiresMono?: boolean
): Promise<COMPATIBLE_RESULT> {
	if (!executablePaths || executablePaths.length === 0) {
		return { status: "NOT_FOUND", godotPath: undefined };
	}

	for (const godotPath of executablePaths) {
		if (!godotPath || godotPath.trim() === "") {
			continue;
		}

		const info = await query_godot_executable(godotPath);
		
		if (!info) {
			continue;
		}

		// Check major version matches
		if (!info.version.startsWith(projectVersion + ".")) {
			continue;
		}

		// Check minor version if specified (strictly compatible)
		if (projectVersionMinor && info.version !== projectVersionMinor) {
			continue;
		}

		// Check mono requirement if specified
		if (requiresMono !== undefined && info.isMono !== requiresMono) {
			continue;
		}

		// Found a compatible executable
		return {
			status: "FOUND",
			godotPath: info.path,
			version: info.version,
			isMono: info.isMono
		};
	}

	// No compatible executable found
	return { status: "NOT_FOUND", godotPath: undefined };
}

/**
 * Gets the appropriate Godot executable path for the current project.
 * Supports both single path and array of paths configuration.
 * @param settingName The configuration setting name (e.g., "editorPath.godot4")
 * @returns VERIFY_RESULT with the verified executable path
 */
export async function get_godot_executable_for_project(settingName: string): Promise<VERIFY_RESULT> {
	const EXTENSION_PREFIX = "godotTools";
	const configValue = vscode.workspace.getConfiguration(EXTENSION_PREFIX).get(settingName, null);
	
	// If no value configured
	if (configValue === null || configValue === undefined) {
		return { status: "INVALID_EXE", godotPath: "" };
	}

	// If it's an array, use the new find_compatible_godot_executable function
	if (Array.isArray(configValue) && configValue.length > 0) {
		const projectVersion = await get_project_version();
		const projectUsesCSharp = await get_project_uses_csharp();
		
		if (projectVersion === undefined) {
			return { status: "INVALID_EXE", godotPath: "" };
		}

		const majorVersion = projectVersion[0];
		const result = await find_compatible_godot_executable(
			configValue,
			majorVersion,
			projectVersion,
			projectUsesCSharp
		);

		if (result.status === "FOUND") {
			return {
				status: "SUCCESS",
				godotPath: result.godotPath!,
				version: result.version
			};
		} else {
			return {
				status: "WRONG_VERSION",
				godotPath: configValue[0] || "",
				version: projectVersion
			};
		}
	}

	// Single path (backward compatibility)
	const singlePath = Array.isArray(configValue) ? configValue[0] : configValue;
	return verify_godot_version(singlePath, projectVersion ? projectVersion[0] : "4");
}

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
	let pathToClean = godotPath;

	// check for environment variable syntax
	// looking for: ${env:FOOBAR}
	// extracts "FOOBAR"
	const pattern = /\$\{env:(.+?)\}/;
	const match = godotPath.match(pattern);

	if (match && match.length >= 2)	{
		pathToClean = process.env[match[1]];
	}

	// strip leading and trailing quotes
	let target = pathToClean.replace(/^"/, "").replace(/"$/, "");

	// try to fix macos paths
	if (os.platform() === "darwin" && target.endsWith(".app")) {
		target = path.join(target, "Contents", "MacOS", "Godot");
	}

	return target;
}

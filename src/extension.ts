import debuggerContext = require("./debugger/debugger_context");
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { attemptSettingsUpdate } from "./settings_updater";
import { GDDocumentLinkProvider } from "./document_link_provider";
import { ClientConnectionManager } from "./lsp/ClientConnectionManager";
import { ScenePreviewProvider } from "./scene_preview_provider";
import {
	get_configuration,
	set_configuration,
	find_file,
	find_project_file,
	register_command
} from "./utils";

const TOOL_NAME = "GodotTools";

let lspClientManager: ClientConnectionManager = null;
let linkProvider: GDDocumentLinkProvider = null;
let scenePreviewManager: ScenePreviewProvider = null;

export function activate(context: vscode.ExtensionContext) {
	attemptSettingsUpdate(context);

	lspClientManager = new ClientConnectionManager(context);
	linkProvider = new GDDocumentLinkProvider(context);
	scenePreviewManager = new ScenePreviewProvider();
	debuggerContext.register_debugger(context);

	context.subscriptions.push(
		register_command("openEditor", () => {
			open_workspace_with_editor("-e").catch(err => vscode.window.showErrorMessage(err));
		}),
		register_command("runProject", () => {
			open_workspace_with_editor().catch(err => vscode.window.showErrorMessage(err));
		}),
		register_command("runProjectDebug", () => {
			open_workspace_with_editor("--debug-collisions --debug-navigation").catch(err => vscode.window.showErrorMessage(err));
		}),
		register_command("copyResourcePathContext", copy_resource_path),
		register_command("copyResourcePath", copy_resource_path),
		register_command("openTypeDocumentation", open_type_documentation),
		register_command("switchSceneScript", switch_scene_script),
	)

}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		lspClientManager.client.stop();
		resolve();
	});
}

function copy_resource_path(uri: vscode.Uri) {
	if (!uri) {
		uri = vscode.window.activeTextEditor.document.uri;
	}

	const project_dir = path.dirname(find_project_file(uri.fsPath));
	if (project_dir === null) {
		return;
	}

	let relative_path = path.normalize(path.relative(project_dir, uri.fsPath));
	relative_path = relative_path.split(path.sep).join(path.posix.sep);
	relative_path = "res://" + relative_path;

	vscode.env.clipboard.writeText(relative_path);
}

function open_type_documentation() {
	lspClientManager.client.open_documentation();
}

async function switch_scene_script() {
	let path = vscode.window.activeTextEditor.document.uri.fsPath;

	if (path.endsWith(".tscn")) {
		path = path.replace(".tscn", ".gd");
	} else if (path.endsWith(".gd")) {
		path = path.replace(".gd", ".tscn");
	}

	const file = await find_file(path);
	if (file) {
		vscode.window.showTextDocument(file);
	}
}

function open_workspace_with_editor(params = "") {
	return new Promise<void>(async (resolve, reject) => {
		let valid = false;
		let project_dir = '';
		let project_file = '';

		if (vscode.workspace.workspaceFolders != undefined) {
			const files = await vscode.workspace.findFiles("**/project.godot");
			if (files) {
				project_file = files[0].fsPath;
				project_dir = path.dirname(project_file);
				let cfg = project_file;
				valid = (fs.existsSync(cfg) && fs.statSync(cfg).isFile());
			}
		}
		if (valid) {
			run_editor(`--path "${project_dir}" ${params}`).then(() => resolve()).catch(err => {
				reject(err);
			});
		} else {
			reject("Current workspace is not a Godot project");
		}
	});
}

function run_editor(params = "") {
	// TODO: rewrite this entire function
	return new Promise<void>((resolve, reject) => {
		const run_godot = (path: string, params: string) => {
			const is_powershell_path = (path?: string) => {
				const POWERSHELL = "powershell.exe";
				const POWERSHELL_CORE = "pwsh.exe";
				return path && (path.endsWith(POWERSHELL) || path.endsWith(POWERSHELL_CORE));
			};
			const escape_command = (cmd: string) => {
				const cmdEsc = `"${cmd}"`;
				if (process.platform === "win32") {
					const shell_plugin = vscode.workspace.getConfiguration("terminal.integrated.shell");

					if (shell_plugin) {
						const shell = shell_plugin.get<string>("windows");
						if (shell) {
							if (is_powershell_path(shell)) {
								return `&${cmdEsc}`;
							} else {
								return cmdEsc;
							}
						}
					}

					const POWERSHELL_SOURCE = "PowerShell";
					const default_profile = vscode.workspace.getConfiguration("terminal.integrated.defaultProfile");
					if (default_profile) {
						const profile_name = default_profile.get<string>("windows");
						if (profile_name) {
							if (POWERSHELL_SOURCE === profile_name) {
								return `&${cmdEsc}`;
							}
							const profiles = vscode.workspace.getConfiguration("terminal.integrated.profiles.windows");
							const profile = profiles.get<{ source?: string, path?: string }>(profile_name);
							if (profile) {
								if (POWERSHELL_SOURCE === profile.source || is_powershell_path(profile.path)) {
									return `&${cmdEsc}`;
								} else {
									return cmdEsc;
								}
							}
						}
					}
					// default for Windows if nothing is set is PowerShell
					return `&${cmdEsc}`;

				}
				return cmdEsc;
			};
			let existingTerminal = vscode.window.terminals.find(t => t.name === TOOL_NAME);
			if (existingTerminal) {
				existingTerminal.dispose();
			}
			let terminal = vscode.window.createTerminal(TOOL_NAME);
			let editorPath = escape_command(path);
			let cmmand = `${editorPath} ${params}`;
			terminal.sendText(cmmand, true);
			terminal.show();
			resolve();
		};

		// TODO: This config doesn't exist anymore
		let editorPath = get_configuration("editorPath");
		if (!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
			vscode.window.showOpenDialog({
				openLabel: "Run",
				filters: process.platform === "win32" ? { "Godot Editor Binary": ["exe", "EXE"] } : undefined
			}).then((uris: vscode.Uri[]) => {
				if (!uris) {
					return;
				}
				let path = uris[0].fsPath;
				if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
					reject("Invalid editor path to run the project");
				} else {
					run_godot(path, params);
					set_configuration("editorPath", path);
				}
			});
		} else {
			run_godot(editorPath, params);
		}
	});
}

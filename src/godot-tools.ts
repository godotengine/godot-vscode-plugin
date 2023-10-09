import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { GDDocumentLinkProvider } from "./document_link_provider";
import { ClientConnectionManager } from "./lsp/ClientConnectionManager";
import { ScenePreviewProvider } from "./scene_preview_provider";
import {
	get_configuration,
	set_configuration,
	find_file,
	find_project_file,
	register_command
} from "@utils";

const TOOL_NAME = "GodotTools";

export class GodotTools {
	private context: vscode.ExtensionContext;

	private lspClientManager: ClientConnectionManager = null;
	private linkProvider: GDDocumentLinkProvider = null;
	private scenePreviewManager: ScenePreviewProvider = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;

		this.lspClientManager = new ClientConnectionManager(p_context);
		this.linkProvider = new GDDocumentLinkProvider(p_context);
	}

	public activate() {
		register_command("openEditor", () => {
			this.open_workspace_with_editor("-e").catch(err => vscode.window.showErrorMessage(err));
		});
		register_command("runProject", () => {
			this.open_workspace_with_editor().catch(err => vscode.window.showErrorMessage(err));
		});
		register_command("runProjectDebug", () => {
			this.open_workspace_with_editor("--debug-collisions --debug-navigation").catch(err => vscode.window.showErrorMessage(err));
		});
		register_command("setSceneFile", this.set_scene_file.bind(this));
		register_command("copyResourcePathContext", this.copy_resource_path.bind(this));
		register_command("copyResourcePath", this.copy_resource_path.bind(this));
		register_command("openTypeDocumentation", this.open_type_documentation.bind(this));
		register_command("switchSceneScript", this.switch_scene_script.bind(this));

		this.scenePreviewManager = new ScenePreviewProvider();
	}

	public deactivate() {
		this.lspClientManager.client.stop();
	}

	private open_workspace_with_editor(params = "") {
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
				this.run_editor(`--path "${project_dir}" ${params}`).then(() => resolve()).catch(err => {
					reject(err);
				});
			} else {
				reject("Current workspace is not a Godot project");
			}
		});
	}

	private copy_resource_path(uri: vscode.Uri) {
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

	private open_type_documentation() {
		this.lspClientManager.client.open_documentation();
	}

	private async switch_scene_script() {
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

	private set_scene_file(uri: vscode.Uri) {
		let right_clicked_scene_path = uri.fsPath;
		let scene_config = get_configuration("sceneFileConfig");
		if (scene_config == right_clicked_scene_path) {
			scene_config = "";
		}
		else {
			scene_config = right_clicked_scene_path;
		}

		set_configuration("sceneFileConfig", scene_config);
	}

	private run_editor(params = "") {
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
}

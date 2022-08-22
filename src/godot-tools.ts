import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import { GDDocumentLinkProvider } from "./document_link_provider";
import GDScriptLanguageClient, { ClientStatus } from "./lsp/GDScriptLanguageClient";
import { get_configuration, set_configuration } from "./utils";

const CONFIG_CONTAINER = "godot_tools";
const TOOL_NAME = "GodotTools";

export class GodotTools {
	private reconnection_attempts = 0;
	private context: vscode.ExtensionContext;
	private client: GDScriptLanguageClient = null;
	private linkProvider: GDDocumentLinkProvider = null;

	// deprecated, need to replace with "vscode.workspace.workspaceFolders", but
	// that's an array and not a single value
	private workspace_dir = vscode.workspace.rootPath;
	private project_file_name = "project.godot";
	private project_file = "";
	private project_dir = "";
	private connection_status: vscode.StatusBarItem = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;
		this.client = new GDScriptLanguageClient(p_context);
		this.client.watch_status(this.on_client_status_changed.bind(this));
		this.connection_status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

		this.linkProvider = new GDDocumentLinkProvider(p_context);
                
		setInterval(() => {
			this.retry_callback();
		}, get_configuration("reconnect_cooldown", 3000));
	}

	public activate() {
		vscode.commands.registerCommand("godot-tool.open_editor", () => {
			this.open_workspace_with_editor("-e").catch(err => vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.run_project", () => {
			this.open_workspace_with_editor().catch(err => vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.run_project_debug", () => {
			this.open_workspace_with_editor("--debug-collisions --debug-navigation").catch(err => vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.check_status", this.check_client_status.bind(this));
		vscode.commands.registerCommand("godot-tool.set_scene_file", this.set_scene_file.bind(this));
		vscode.commands.registerCommand("godot-tool.copy_resource_path_context", this.copy_resource_path.bind(this));
		vscode.commands.registerCommand("godot-tool.copy_resource_path", this.copy_resource_path.bind(this));
		vscode.commands.registerCommand("godot-tool.open_type_documentation", this.open_type_documentation.bind(this));

		vscode.commands.executeCommand('setContext', 'godotTools.connectedToEditor', false);

		this.connection_status.text = "$(sync) Initializing";
		this.connection_status.command = "godot-tool.check_status";
		this.connection_status.show();

		// TODO: maybe cache this result somehow
		const klaw = require('klaw');
		klaw(this.workspace_dir)
			.on('data', item => {
				if (path.basename(item.path) == this.project_file_name) {
					this.project_dir = path.dirname(item.path);
					this.project_file = item.path;
				}
			});

		this.reconnection_attempts = 0;
		this.client.connect_to_server();
	}

	public deactivate() {
		this.client.stop();
	}

	private open_workspace_with_editor(params = "") {

		return new Promise<void>((resolve, reject) => {
			let valid = false;
			if (this.project_dir) {
				let cfg = this.project_file;
				valid = (fs.existsSync(cfg) && fs.statSync(cfg).isFile());
			}
			if (valid) {
				this.run_editor(`--path "${this.project_dir}" ${params}`).then(() => resolve()).catch(err => {
					reject(err);
				});
			} else {
				reject("Current workspace is not a Godot project");
			}
		});
	}

	private copy_resource_path(uri: vscode.Uri) {
		if (!this.project_dir) {
			return;
		}
		
		if (!uri) {
			uri = vscode.window.activeTextEditor.document.uri;
		}

		let relative_path = path.normalize(path.relative(this.project_dir, uri.fsPath));
		relative_path = relative_path.split(path.sep).join(path.posix.sep);
		relative_path = 'res://' + relative_path;

		vscode.env.clipboard.writeText(relative_path);
	}

	private open_type_documentation(uri: vscode.Uri) {
		// get word under cursor
		const activeEditor = vscode.window.activeTextEditor;
		const document = activeEditor.document;
		const curPos = activeEditor.selection.active;
		const wordRange = document.getWordRangeAtPosition(curPos);
		const symbolName = document.getText(wordRange);

		this.client.open_documentation(symbolName);
	}

	private set_scene_file(uri: vscode.Uri) {
		let right_clicked_scene_path = uri.fsPath;
		let scene_config = get_configuration("scene_file_config");
		if (scene_config == right_clicked_scene_path) {
			scene_config = "";
		}
		else {
			scene_config = right_clicked_scene_path;
		}

		set_configuration("scene_file_config", scene_config);
	}

	private run_editor(params = "") {

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

			let editorPath = get_configuration("editor_path", "");
			editorPath = editorPath.replace("${workspaceRoot}", this.workspace_dir);
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
						set_configuration("editor_path", path);
					}
				});
			} else {
				run_godot(editorPath, params);
			}
		});
	}

	private check_client_status() {
		let host = get_configuration("gdscript_lsp_server_host", "localhost");
		let port = get_configuration("gdscript_lsp_server_port", 6008);
		switch (this.client.status) {
			case ClientStatus.PENDING:
				vscode.window.showInformationMessage(`Connecting to the GDScript language server at ${host}:${port}`);
				break;
			case ClientStatus.CONNECTED:
				vscode.window.showInformationMessage("Connected to the GDScript language server.");
				break;
			case ClientStatus.DISCONNECTED:
				this.retry_connect_client();
				break;
		}
	}

	private on_client_status_changed(status: ClientStatus) {
		let host = get_configuration("gdscript_lsp_server_host", "localhost");
		let port = get_configuration("gdscript_lsp_server_port", 6008);
		switch (status) {
			case ClientStatus.PENDING:
				this.connection_status.text = `$(sync) Connecting`;
				this.connection_status.tooltip = `Connecting to the GDScript language server at ${host}:${port}`;
				break;
			case ClientStatus.CONNECTED:
				this.retry = false;
				vscode.commands.executeCommand('setContext', 'godotTools.connectedToEditor', true);
				this.connection_status.text = `$(check) Connected`;
				this.connection_status.tooltip = `Connected to the GDScript language server.`;
				if (!this.client.started) {
					this.context.subscriptions.push(this.client.start());
				}
				break;
			case ClientStatus.DISCONNECTED:
				if (this.retry) {
					this.connection_status.text = `$(sync) Connecting ` + this.reconnection_attempts;
					this.connection_status.tooltip = `Connecting to the GDScript language server...`;
				} else {
					vscode.commands.executeCommand('setContext', 'godotTools.connectedToEditor', false);
					this.connection_status.text = `$(x) Disconnected`;
					this.connection_status.tooltip = `Disconnected from the GDScript language server.`;
				}
				this.retry = true;
				break;
			default:
				break;
		}
	}

	private retry = false;

	private retry_callback() {
		if (this.retry) {
			this.retry_connect_client();
		}
	}

	private retry_connect_client() {
		const auto_retry = get_configuration("reconnect_automatically", true);
		const max_attempts = get_configuration("reconnect_attempts", 10);
		if (auto_retry && this.reconnection_attempts <= max_attempts) {
			this.reconnection_attempts++;
			this.client.connect_to_server();
			this.connection_status.text = `Connecting ` + this.reconnection_attempts;
			this.retry = true;
			return;
		}

		this.retry = false;
		this.connection_status.text = `$(x) Disconnected`;
		this.connection_status.tooltip = `Disconnected from the GDScript language server.`;

		let host = get_configuration("gdscript_lsp_server_host", "localhost");
		let port = get_configuration("gdscript_lsp_server_port", 6008);
		let message = `Couldn't connect to the GDScript language server at ${host}:${port}. Is the Godot editor running?`;
		vscode.window.showErrorMessage(message, 'Open Godot Editor', 'Retry', 'Ignore').then(item => {
			if (item == 'Retry') {
				this.reconnection_attempts = 0;
				this.client.connect_to_server();
			} else if (item == 'Open Godot Editor') {
				this.client.status = ClientStatus.PENDING;
				this.open_workspace_with_editor("-e").then(() => {
					setTimeout(() => {
						this.reconnection_attempts = 0;
						this.client.connect_to_server();
					}, 10 * 1000);
				});
			}
		});
	}
}

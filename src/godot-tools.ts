import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import GDScriptLanguageClient, { ClientStatus } from "./lsp/GDScriptLanguageClient";
import { get_configuration, set_configuration } from "./utils";

const CONFIG_CONTAINER = "godot_tools";
const TOOL_NAME = "GodotTools";
const EDIT_TERMINAL = TOOL_NAME + 'Edit';
const RUN_TERMINAL = TOOL_NAME + 'Run';


export class GodotTools {

	private context: vscode.ExtensionContext;
	private client: GDScriptLanguageClient = null;
	private workspace_dir = vscode.workspace.rootPath;
	private project_file = "project.godot";
	private connection_status: vscode.StatusBarItem = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;
		this.client = new GDScriptLanguageClient(p_context);
		this.client.watch_status(this.on_client_status_changed.bind(this));
		this.connection_status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	}

	public activate() {
		vscode.commands.registerCommand("godot-tool.open_editor", ()=>{
			this.open_workspace_with_editor(EDIT_TERMINAL, "-e").catch(err=>vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.run_project", ()=>{
			this.open_workspace_with_editor(RUN_TERMINAL).catch(err=>vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.check_status", this.check_client_status.bind(this));

		this.addRunGodotCommand();

		this.connection_status.text = "$(sync) Initializing";
		this.connection_status.command = "godot-tool.check_status";
		this.connection_status.show();
		this.client.connect_to_server();
	}


	public deactivate() {
		this.client.stop();
	}

	private addRunGodotCommand(){
		const command = 'godot-tool.run_godot';
    	const commandHandler = (terminalName:string,  params: string = '') => {
			return this.open_workspace_with_editor(terminalName, params)
    	};
    	this.context.subscriptions.push(vscode.commands.registerCommand(command, commandHandler));
	}

	private open_workspace_with_editor(terminalName,  params = "") {

		return new Promise((resolve, reject) => {
			let valid = false
			if (this.workspace_dir) {
				let cfg = path.join(this.workspace_dir, this.project_file);
				valid = (fs.existsSync(cfg) && fs.statSync(cfg).isFile());
			}
			if (valid) {
				this.runEditor(terminalName, `--path "${this.workspace_dir}" ${params}`);
				resolve();
				// this.run_editor(terminalName, `--path "${this.workspace_dir}" ${params}`).then(()=>resolve()).catch(err=>{
				// 	reject(err);
				// });
			} else {
				reject("Current workspace is not a Godot project");
			}
		});
	}

	private escapeCommand(cmd: string){
		let cmdEsc = `"${cmd}"`;
		if (process.platform === "win32") {
			const POWERSHELL = "powershell.exe";
			const shell_plugin = vscode.workspace.getConfiguration("terminal.integrated.shell");
			let shell = (shell_plugin ? shell_plugin.get("windows", POWERSHELL) : POWERSHELL) || POWERSHELL;
			if (shell.endsWith(POWERSHELL)) {
				cmdEsc = `&${cmdEsc}`;
			}
		}
		return cmdEsc;
	}

	private getRunGodotCommand(){
		let editorPath = get_configuration("editor_path", "")
		if(this.verifyEditorPathSetting(editorPath)){
			editorPath = editorPath.replace("${workspaceRoot}", this.workspace_dir);
			editorPath = this.escapeCommand(editorPath);	
		} else {
			editorPath = undefined;
		}
		return editorPath;
	}

	private verifyEditorPathSetting(editorPath){
		let isValid = false;
		if (!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
			vscode.window.showErrorMessage(`Could not find ${editorPath}.  Please verify that the Godot_tools:Editor_path setting has a proper value.`)
		} else {
			isValid = true;
		}
		return isValid;
	}

	/**
	 * Creates a new terminal or disposes and recreates a terminal with the 
	 * given name that runs the passed in command.
	 * @param terminalName the name of the terminal to create or reuse
	 * @param command the command to run in the terminal
	 */
	private reuseTerminal(terminalName, command){
		let existingTerminal = vscode.window.terminals.find(t => t.name === terminalName)
		if (existingTerminal) {
			existingTerminal.dispose()
		}
		let terminal = vscode.window.createTerminal(terminalName);
		terminal.sendText(command, true);
		terminal.show();
	}

	private runEditor(terminalName, params=""){
		let runCmd = this.getRunGodotCommand()
		if(runCmd){
			this.reuseTerminal(terminalName, `${runCmd} ${params}`)
		}	
	}

	// private run_editor(terminalName,  params = "",) {
	// 	console.log("command = " + this.getRunGodotCommand());
	// 	return new Promise((resolve, reject) => {
	// 		const run_godot = (path: string, params: string) => {
	// 			const escape_command = (cmd: string) => {
	// 				let cmdEsc = `"${cmd}"`;
	// 				if (process.platform === "win32") {
	// 					const POWERSHELL = "powershell.exe";
	// 					const shell_plugin = vscode.workspace.getConfiguration("terminal.integrated.shell");
	// 					let shell = (shell_plugin ? shell_plugin.get("windows", POWERSHELL) : POWERSHELL) || POWERSHELL;
	// 					if (shell.endsWith(POWERSHELL)) {
	// 						cmdEsc = `&${cmdEsc}`;
	// 					}
	// 				}
	// 				return cmdEsc;
	// 			};


	// 			let existingTerminal = vscode.window.terminals.find(t => t.name === terminalName)
	// 			if (existingTerminal) {
	// 				existingTerminal.dispose()
	// 			}
	// 			let terminal = vscode.window.createTerminal(terminalName);
	// 			let editorPath = escape_command(path);
	// 			let cmmand = `${editorPath} ${params}`;
	// 			terminal.sendText(cmmand, true);
	// 			terminal.show();
	// 			resolve(); 
	// 		};



	// 		let editorPath = get_configuration("editor_path", "")
	// 		editorPath = editorPath.replace("${workspaceRoot}", this.workspace_dir);
	// 		if (!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
	// 			vscode.window.showOpenDialog({
	// 					openLabel: "Run",
	// 					filters: process.platform === "win32" ? {"Godot Editor Binary": ["exe", "EXE"]} : undefined
	// 				}).then((uris: vscode.Uri[])=> {
	// 					if (!uris) return;

	// 					let path = uris[0].fsPath;
	// 					if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
	// 						reject("Invalid editor path to run the project");
	// 					} else {
	// 						run_godot(path, params);
	// 						set_configuration("editor_path", path);
	// 					}
	// 			});
	// 		} else {
	// 			run_godot(editorPath, params);
	// 		}
	// 	});
	// }

	private check_client_status() {
		switch (this.client.status) {
			case ClientStatus.PENDING:
				vscode.window.showInformationMessage("Connecting to the GDScript language server...");
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
		switch (status) {
			case ClientStatus.PENDING:
				this.connection_status.text = `$(sync) Connecting`;
				this.connection_status.tooltip = `Connecting to the GDScript language server...`;
				break;
			case ClientStatus.CONNECTED:
				this.connection_status.text = `$(check) Connected`;
				this.connection_status.tooltip = `Connected to the GDScript language server.`;
				if (!this.client.started) {
					this.context.subscriptions.push(this.client.start());
				}
				break;
			case ClientStatus.DISCONNECTED:
				this.connection_status.text = `$(x) Disconnected`;
				this.connection_status.tooltip = `Disconnected from the GDScript language server.`;
				// retry
				this.retry_connect_client();
				break;
			default:
				break;
		}
	}

	private retry_connect_client() {
		vscode.window.showErrorMessage(`Couldn't connect to the GDScript language server.`, 'Open Godot Editor', 'Retry', 'Ignore').then(item=>{
			if (item == 'Retry') {
				this.client.connect_to_server();
			} else if (item == 'Open Godot Editor') {
				this.client.status = ClientStatus.PENDING;
				this.open_workspace_with_editor(EDIT_TERMINAL, "-e").then(()=>{
					setTimeout(()=>{
						this.client.connect_to_server();
					}, 10 * 1000);
				});
			}
		});
	}
};

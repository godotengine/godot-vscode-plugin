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

		this.addGetRunWorkspaceCommandCmd();
		this.addRunGodotCmd();

		this.connection_status.text = "$(sync) Initializing";
		this.connection_status.command = "godot-tool.check_status";
		this.connection_status.show();
		this.client.connect_to_server();
	}


	public deactivate() {
		this.client.stop();
	}

	private addGetRunWorkspaceCommandCmd(){
		const command = 'godot-tool.get_run_workspace_command';
    	const commandHandler = (terminalName:string,  params: string = '') => {
			return new Promise((resolve, reject) => {
				resolve(this.getRunGodotCommand());
			});
    	};
    	this.context.subscriptions.push(vscode.commands.registerCommand(command, commandHandler));
	}

	private addRunGodotCmd(){
		const command = 'godot-tool.run_godot';
		const commandHandler = (terminalName:string,  params: string = '') => {
			return this.open_workspace_with_editor(terminalName, params)
		};
		this.context.subscriptions.push(vscode.commands.registerCommand(command, commandHandler));
	}
	

	private open_workspace_with_editor(terminalName:string,  params:string = "") {

		return new Promise((resolve, reject) => {
			let valid = false
			if (this.workspace_dir) {
				let cfg = path.join(this.workspace_dir, this.project_file);
				valid = (fs.existsSync(cfg) && fs.statSync(cfg).isFile());
			}
			if (valid) {
				this.runEditor(terminalName, `--path "${this.workspace_dir}" ${params}`);
				resolve();
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

	/**
	 * Returns a string that can be used to launch Godot for the current
	 * workspace.  This uses the editor_path setting.  If that value of that 
	 * setting cannot be found on the file system then undefined will be 
	 * returned and an error message will be displayed on the screen.
	 */
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

	/**
	 * Verifies that the path passed in exists.  If it does not then an error
	 * message will be displayed and false will be returned.  Otherwise true 
	 * will be returned.
	 * @param editorPath The path to the godot executable
	 */
	private verifyEditorPathSetting(editorPath:string){
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
	private reuseTerminal(terminalName:string, command:string){
		let existingTerminal = vscode.window.terminals.find(t => t.name === terminalName)
		if (existingTerminal) {
			existingTerminal.dispose()
		}
		let terminal = vscode.window.createTerminal(terminalName);
		terminal.sendText(command, true);
		terminal.show();
	}

	/**
	 * This will run Godot in the named terminal.
	 * @param terminalName The name of the terminal to run Godot in
	 * @param params any command line params to pass to Godot
	 */
	private runEditor(terminalName: string, params: string = ""){
		let runCmd = this.getRunGodotCommand()
		if(runCmd){
			this.reuseTerminal(terminalName, `${runCmd} ${params}`)
		}	
	}


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

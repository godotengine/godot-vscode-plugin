import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import GDScriptLanguageClient from "./lsp/GDScriptLanguageClient";
import { get_configuration, set_configuration } from "./utils";
import { MessageIO } from "./lsp/MessageIO";

const CONFIG_CONTAINER = "godot_tools";
const TOOL_NAME = "GodotTools";

enum ClientStatus {
	PENDING,
	DISCONNECTED,
	CONNECTED,
}

export class GodotTools {

	private context: vscode.ExtensionContext;
	private client: GDScriptLanguageClient = null;
	private workspace_dir = vscode.workspace.rootPath;
	private project_file = "project.godot";
	private connection_status: vscode.StatusBarItem = null;
	private message_handler: MessageHandler = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;
		this.client = new GDScriptLanguageClient();
		this.message_handler = new MessageHandler(this.client.io);
		this.client.io.on('disconnected', this.on_client_disconnected.bind(this));
		this.client.io.on('connected', this.on_server_connected.bind(this));
		this.connection_status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	}
	
	public activate() {
		vscode.commands.registerCommand("godot-tool.open_editor", ()=>{
			this.open_workspace_with_editor("-e").catch(err=>vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godot-tool.run_project", ()=>{
			this.open_workspace_with_editor().catch(err=>vscode.window.showErrorMessage(err));
		});
		this.connection_status.text = "starting";
		this.connection_status.show();
		this.try_connect_to_server();
	}
	
	
	
	public deactivate() {
		this.client.stop();
	}
	

	private open_workspace_with_editor(params = "") {
		
		return new Promise((resolve, reject) => {
			let valid = false
			if (this.workspace_dir) {
				let cfg = path.join(this.workspace_dir, this.project_file);
				valid = (fs.existsSync(cfg) && fs.statSync(cfg).isFile());
			}
			if (valid) {
				this.run_editor(`--path "${this.workspace_dir}" ${params}`).then(()=>resolve()).catch(err=>{
					reject(err);
				});
			} else {
				reject("Current workspace is not a Godot project");
			}
		});
	}

	private run_editor(params = "") {
		
		return new Promise((resolve, reject) => {
			const run_godot = (path: string, params: string) => {
				const escape_command = (cmd: string) => {
					let cmdEsc = `"${cmd}"`;
					let shell = vscode.workspace.getConfiguration("terminal.integrated.shell").get("windows", "");
					if (shell.endsWith("powershell.exe") && process.platform === "win32") {
						cmdEsc = `&${cmdEsc}`;
					}
					return cmdEsc;
				};
				let existingTerminal = vscode.window.terminals.find(t => t.name === TOOL_NAME)
				if (existingTerminal) {
					existingTerminal.dispose()
				}
				let terminal = vscode.window.createTerminal(TOOL_NAME);
				let editorPath = escape_command(path);
				let cmmand = `${editorPath} ${params}`;
				terminal.sendText(cmmand, true);
				terminal.show();
				resolve();
			};
			
			let editorPath = get_configuration("editor_path", "")
			editorPath = editorPath.replace("${workspaceRoot}", this.workspace_dir);
			if (!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
				vscode.window.showOpenDialog({
						openLabel: "Run",
						filters: process.platform === "win32" ? {"Godot Editor Binary": ["exe", "EXE"]} : undefined
					}).then((uris: vscode.Uri[])=> {
						if (!uris) return;
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
	
	private try_connect_to_server() {
		this.client.connect_to_server();
		this.update_client_status(ClientStatus.PENDING);
	}
	
	private update_client_status(status: ClientStatus) {
		this.connection_status.color = vscode.ThemeColor;
		switch (status) {
			case ClientStatus.PENDING:
				this.connection_status.text = `$(sync) Connecting`;
				this.connection_status.tooltip = `Connecting to GDScript Language Server`;
				break;
			case ClientStatus.CONNECTED:
				this.connection_status.text = `$(check) Connected`;
				this.connection_status.tooltip = `Connected to GDScript Language Server`;
				break;
			case ClientStatus.DISCONNECTED:
				this.connection_status.text = `$(x) Disconnected`;
				this.connection_status.tooltip = `Disconnect to GDScript Language Server`;
				break;
			default:
				break;
		}
	}
	
	private on_server_connected() {
		this.context.subscriptions.push(this.client.start());
		this.update_client_status(ClientStatus.CONNECTED);
	}
	
	private on_client_disconnected() {
		this.update_client_status(ClientStatus.DISCONNECTED);
		vscode.window.showErrorMessage(`Failed connect to GDScript Language Server`, 'Open Godot Editor', 'Retry', 'Ignore').then(item=>{
			if (item == 'Retry') {
				this.try_connect_to_server();
			} else if (item == 'Open Godot Editor') {
				this.update_client_status(ClientStatus.PENDING);
				this.open_workspace_with_editor("-e").then(()=>{
					setTimeout(()=>{
						this.try_connect_to_server();
					}, 10 * 1000);
				});
			}
		});
	}
	
	
	
};

const CUSTOM_MESSAGE = "gdscrip_client/";

class MessageHandler {
	io: MessageIO = null;
	
	constructor(io: MessageIO) {
		this.io = io;
		this.io.on('message', this.on_server_message.bind(this));
	}
	
	changeWorkspace(params: {path: string}) {
		vscode.window.showErrorMessage("The GDScript Language Server can't work properly!\nThe opening workspace is diffrent with the editor's.", 'Reload', 'Ignore').then(item=>{
			if (item == "Reload") {
				let folderUrl = vscode.Uri.file(params.path);
				vscode.commands.executeCommand('vscode.openFolder', folderUrl, false);
			}
		});
	}
	
	private on_server_message(message: any) {
		if (message && message.method && (message.method as string).startsWith(CUSTOM_MESSAGE)) {
			const method = (message.method as string).substring(CUSTOM_MESSAGE.length, message.method.length);
			if (this[method]) {
				let ret = this[method](message.params);
				if (ret) {
					ret = this.handle_result(message, ret);
					if (ret) {
						this.io.send_message(ret);
					}
				}
			}
		}
	}
	
	private handle_result(request: any, ret: any) {
		let data = ret;
		if (ret) {
			data = JSON.stringify(data);
		}
		return data
	}
}

import * as vscode from "vscode";
import GDScriptLanguageClient, { ClientStatus } from "./GDScriptLanguageClient";
import { get_configuration, get_free_port, get_godot_version, get_project_dir, set_context } from "../utils";
import { createLogger } from "../logger";

const log = createLogger("lsp.manager");

const TOOL_NAME = "GodotTools";

export class ClientConnectionManager {
	private context: vscode.ExtensionContext;
	public client: GDScriptLanguageClient = null;

	private reconnection_attempts = 0;

	private connection_status: vscode.StatusBarItem = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;

		this.client = new GDScriptLanguageClient(p_context);
		this.client.watch_status(this.on_client_status_changed.bind(this));

		this.connection_status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

		setInterval(() => {
			this.retry_callback();
		}, get_configuration("lsp.autoReconnect.cooldown", 3000));

		vscode.commands.registerCommand("godotTools.startLanguageServer", () => {
			this.start_language_server().catch(err => vscode.window.showErrorMessage(err));
		});
		vscode.commands.registerCommand("godotTools.stopLanguageServer", () => {
			this.stop_language_server();
		});
		vscode.commands.registerCommand("godotTools.checkStatus", this.check_client_status.bind(this));

		set_context("godotTools.context.connectedToEditor", false);

		this.connection_status.text = "$(sync) Initializing";
		this.connection_status.command = "godotTools.checkStatus";
		this.connection_status.show();

		this.connect_to_language_server()
	}

	private connect_to_language_server() {
		this.client.port = -1;

		const start = get_configuration("lsp.runAtStartup", false)
		if (start) {
			this.start_language_server();
		}

		this.reconnection_attempts = 0;
		this.client.connect_to_server();
	}

	private stop_language_server() {
		const existingTerminal = vscode.window.terminals.find(t => t.name === `${TOOL_NAME}LSP`);
		if (existingTerminal) {
			existingTerminal.dispose();
		}
	}

	private start_language_server() {
		return new Promise<void>(async (resolve, reject) => {
			const projectDir = await get_project_dir();

			if (!projectDir) {
				reject("Current workspace is not a Godot project");
			}

			const godotVersion = await get_godot_version();

			let editorPath = get_configuration("editorPath.godot3", "godot3");
			let headlessFlag = "--no-window";
			if (godotVersion.startsWith('4')) {
				editorPath = get_configuration("editorPath.godot4", "godot4");
				headlessFlag = "--headless";
			}

			this.client.port = await get_free_port();

			// TODO: find a better way to manage child processes
			// This way works, but it creates a terminal that the user might
			// accidentally close, and start a confusing cycle.
			// I also want to be able to monitor the child process for errors
			// or exits, and restart it as appropriate.

			this.stop_language_server();

			const command = `${editorPath} --path "${projectDir}" --editor ${headlessFlag} --lsp-port ${this.client.port}`;
			const terminal = vscode.window.createTerminal(`${TOOL_NAME}LSP`);
			terminal.sendText(command, true);
		});
	}

	private check_client_status() {
		let host = get_configuration("lsp.serverHost", "localhost");
		let port = get_configuration("lsp.serverPort", 6008);
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
		let host = get_configuration("lsp.serverHost", "localhost");
		let port = get_configuration("lsp.serverPort", 6008);
		switch (status) {
			case ClientStatus.PENDING:
				this.connection_status.text = `$(sync) Connecting`;
				this.connection_status.tooltip = `Connecting to the GDScript language server at ${host}:${port}`;
				break;
			case ClientStatus.CONNECTED:
				this.retry = false;
				set_context("godotTools.context.connectedToEditor", true);
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
					set_context("godotTools.context.connectedToEditor", false);
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
		const auto_retry = get_configuration("lsp.autoReconnect.enabled", true);
		const max_attempts = get_configuration("lsp.autoReconnect.attempts", 10);
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

		let host = get_configuration("lsp.serverHost", "localhost");
		let port = get_configuration("lsp.serverPort", 6008);
		let message = `Couldn't connect to the GDScript language server at ${host}:${port}. Is the Godot editor or language server running?`;
		vscode.window.showErrorMessage(message, "Open Godot Editor", "Retry", "Ignore").then(item => {
			if (item == "Retry") {
				this.connect_to_language_server()
			} else if (item == "Open Godot Editor") {
				this.client.status = ClientStatus.PENDING;
				// this.open_workspace_with_editor("-e").then(() => {
				// 	setTimeout(() => {
				// 		this.reconnection_attempts = 0;
				// 		this.client.connect_to_server();
				// 	}, 10 * 1000);
				// });
			}
		});
	}





}

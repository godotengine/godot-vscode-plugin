import * as vscode from "vscode";
import GDScriptLanguageClient, { ClientStatus } from "./GDScriptLanguageClient";
import { get_configuration, get_free_port, get_godot_version, get_project_dir, set_context } from "@utils";
import { createLogger } from "@logger";
import { ChildProcess } from "child_process";
import { subProcess, killSubProcesses } from '@utils/subspawn';

const log = createLogger("lsp.manager");

const TOOL_NAME = "GodotTools";

export class ClientConnectionManager {
	private context: vscode.ExtensionContext;
	public client: GDScriptLanguageClient = null;

	private reconnection_attempts = 0;

	private connection_status: vscode.StatusBarItem = null;
	private lspProcess: ChildProcess = null

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;

		this.client = new GDScriptLanguageClient(p_context);
		this.client.watch_status(this.on_client_status_changed.bind(this));

		setInterval(() => {
			this.retry_callback();
		}, get_configuration("lsp.autoReconnect.cooldown"));

		vscode.commands.registerCommand("godotTools.startLanguageServer", () => {
			this.start_language_server().catch(err => vscode.window.showErrorMessage(err));

			this.reconnection_attempts = 0;
			this.client.connect_to_server();
		});
		vscode.commands.registerCommand("godotTools.stopLanguageServer", () => {
			this.stop_language_server();
		});
		vscode.commands.registerCommand("godotTools.checkStatus", this.check_client_status.bind(this));

		set_context("connectedToLSP", false);

		this.connection_status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
		this.connection_status.text = "$(sync~spin) Initializing";
		this.connection_status.command = "godotTools.checkStatus";
		this.connection_status.show();

		this.connect_to_language_server()
	}

	private connect_to_language_server() {
		this.client.port = -1;

		const start = get_configuration("lsp.runAtStartup");
		if (start) {
			this.start_language_server();
		}

		this.reconnection_attempts = 0;
		this.client.connect_to_server();
	}

	private stop_language_server() {
		log.debug('stop_language_server');

		killSubProcesses('LSP');
	}

	private start_language_server() {
		this.stop_language_server();

		return new Promise<void>(async (resolve, reject) => {
			log.debug('start_language_server');
			const projectDir = await get_project_dir();

			if (!projectDir) {
				reject("Current workspace is not a Godot project");
			}

			const godotVersion = await get_godot_version();

			let editorPath = get_configuration("editorPath.godot3");
			let headlessFlag = "--no-window";
			if (godotVersion.startsWith('4')) {
				editorPath = get_configuration("editorPath.godot4");
				headlessFlag = "--headless";
			}

			this.client.port = await get_free_port();


			const command = `${editorPath} --path "${projectDir}" --editor ${headlessFlag} --lsp-port ${this.client.port}`;

			log.debug(`starting headless LSP on port ${this.client.port}`);

			this.lspProcess = subProcess("LSP", command, { shell: true });

			const lspStdout = createLogger("lsp.stdout");
			this.lspProcess.stdout.on('data', (data) => {
				const out = data.toString().trim();
				if (out) {
					lspStdout.debug(out);
				}
			});

			// const lspStderr = createLogger("lsp.stderr");
			// this.lspProcess.stderr.on('data', (data) => {
			// 	const out = data.toString().trim();
			// 	if (out) {
			// 		lspStderr.debug(out);
			// 	}
			// });

			this.lspProcess.on('close', (code) => {
				log.debug(`LSP process exited with code ${code}`);
			});
		});
	}

	private check_client_status() {
		let host = get_configuration("lsp.serverHost");
		let port = get_configuration("lsp.serverPort");
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
		let host = get_configuration("lsp.serverHost");
		let port = get_configuration("lsp.serverPort");
		switch (status) {
			case ClientStatus.PENDING:
				this.connection_status.text = `$(sync~spin) Connecting`;
				this.connection_status.tooltip = `Connecting to the GDScript language server at ${host}:${port}`;
				break;
			case ClientStatus.CONNECTED:
				this.retry = false;
				set_context("connectedToLSP", true);
				this.connection_status.text = `$(check) Connected`;
				this.connection_status.tooltip = `Connected to the GDScript language server.`;
				if (!this.client.started) {
					this.context.subscriptions.push(this.client.start());
				}
				break;
			case ClientStatus.DISCONNECTED:
				if (this.retry) {
					this.connection_status.text = `$(sync~spin) Connecting ` + this.reconnection_attempts;
					this.connection_status.tooltip = `Connecting to the GDScript language server...`;
				} else {
					set_context("connectedToLSP", false);
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
		const auto_retry = get_configuration("lsp.autoReconnect.enabled");
		const max_attempts = get_configuration("lsp.autoReconnect.attempts");
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

		let host = get_configuration("lsp.serverHost");
		let port = get_configuration("lsp.serverPort");
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

import * as vscode from "vscode";
import GDScriptLanguageClient, { ClientStatus } from "./GDScriptLanguageClient";
import {
	get_configuration,
	get_free_port,
	get_project_version,
	get_project_dir,
	set_context,
	register_command,
} from "../utils";
import { createLogger } from "../logger";
import { execSync } from "child_process";
import { subProcess, killSubProcesses } from '../utils/subspawn';

const log = createLogger("lsp.manager");

enum ManagerStatus {
	INITIALIZING,
	INITIALIZING_LSP,
	PENDING,
	PENDING_LSP,
	DISCONNECTED,
	CONNECTED,
	RETRYING,
}

export class ClientConnectionManager {
	private context: vscode.ExtensionContext;
	public client: GDScriptLanguageClient = null;

	private reconnection_attempts = 0;

	private status: ManagerStatus = ManagerStatus.INITIALIZING;
	private statusWidget: vscode.StatusBarItem = null;

	constructor(p_context: vscode.ExtensionContext) {
		this.context = p_context;

		this.client = new GDScriptLanguageClient(p_context);
		this.client.watch_status(this.on_client_status_changed.bind(this));

		setInterval(() => {
			this.retry_callback();
		}, get_configuration("lsp.autoReconnect.cooldown"));

		register_command("startLanguageServer", () => {
			this.start_language_server();
			this.reconnection_attempts = 0;
			this.client.connect_to_server();
		});
		register_command("stopLanguageServer", this.stop_language_server.bind(this));
		register_command("checkStatus", this.on_status_item_click.bind(this));

		set_context("connectedToLSP", false);

		this.statusWidget = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
		this.statusWidget.command = "godotTools.checkStatus";
		this.statusWidget.show();
		this.update_status_widget();

		this.connect_to_language_server();
	}

	private async connect_to_language_server() {
		this.client.port = -1;

		if (get_configuration("lsp.headless")) {
			await this.start_language_server();
		}

		this.reconnection_attempts = 0;
		this.client.connect_to_server();
	}

	private stop_language_server() {
		killSubProcesses('LSP');
	}

	private async start_language_server() {
		this.stop_language_server();

		const projectDir = await get_project_dir();

		if (!projectDir) {
			vscode.window.showErrorMessage("Current workspace is not a Godot project");
			return
		}

		const projectVersion = await get_project_version();

		let godotPath = get_configuration("editorPath.godot3");
		let pattern = /3.([0-9]+)/;
		let minimumVersion = '6';
		let headlessFlag = "--no-window";
		if (projectVersion.startsWith('4')) {
			godotPath = get_configuration("editorPath.godot4");
			pattern = /4.([0-9]+)/;
			minimumVersion = '2';
			headlessFlag = "--headless";
		}

		try {
			const exeVersion = execSync(`${godotPath} --version`).toString().trim();
			const match = exeVersion.match(pattern);
			if (match && match[1] < minimumVersion) {
				vscode.window.showErrorMessage("godot exe is too old");
				return;
			}
		} catch (e) {
			vscode.window.showErrorMessage("godot exe is not valid");
		}

		this.client.port = await get_free_port();

		const command = `${godotPath} --path "${projectDir}" --editor ${headlessFlag} --lsp-port ${this.client.port}`;

		log.debug(`starting headless LSP on port ${this.client.port}`);

		const lspProcess = subProcess("LSP", command, { shell: true });

		const lspStdout = createLogger("lsp.stdout");
		lspProcess.stdout.on('data', (data) => {
			const out = data.toString().trim();
			if (out) {
				lspStdout.debug(out);
			}
		});

		// const lspStderr = createLogger("lsp.stderr");
		// lspProcess.stderr.on('data', (data) => {
		// 	const out = data.toString().trim();
		// 	if (out) {
		// 		lspStderr.debug(out);
		// 	}
		// });

		lspProcess.on('close', (code) => {
			log.debug(`LSP process exited with code ${code}`);
		});
	}

	private get_lsp_connection_string() {
		let host = get_configuration("lsp.serverHost");
		let port = get_configuration("lsp.serverPort");
		if (this.client.port !== -1) {
			port = this.client.port;
		}
		return `${host}:${port}`
	}

	private on_status_item_click() {
		const lsp_target = this.get_lsp_connection_string();
		// TODO: fill these out with the ACTIONS a user could perform in each state
		switch (this.status) {
			case ManagerStatus.INITIALIZING:
				// vscode.window.showInformationMessage("Initializing extension");
				break;
			case ManagerStatus.INITIALIZING_LSP:
				// vscode.window.showInformationMessage("Initializing LSP");
				break;
			case ManagerStatus.PENDING:
				// vscode.window.showInformationMessage(`Connecting to the GDScript language server at ${lsp_target}`);
				break;
			case ManagerStatus.CONNECTED:
				// vscode.window.showInformationMessage("Connected to the GDScript language server.");
				break;
			case ManagerStatus.DISCONNECTED:
				this.retry_connect_client();
				break;
			case ManagerStatus.RETRYING:
				break;
		}
	}

	private update_status_widget() {
		const lsp_target = this.get_lsp_connection_string();
		switch (this.status) {
			case ManagerStatus.INITIALIZING:
				// this.statusWidget.text = `INITIALIZING`;
				this.statusWidget.text = `$(sync~spin) Initializing`;
				this.statusWidget.tooltip = `Initializing extension...`;
				break;
			case ManagerStatus.INITIALIZING_LSP:
				// this.statusWidget.text = `INITIALIZING_LSP ` + this.reconnection_attempts;
				this.statusWidget.text = `$(sync~spin) Initializing LSP`;
				this.statusWidget.tooltip = `Connecting to headless GDScript language server at ${lsp_target}`;
				break;
			case ManagerStatus.PENDING:
				// this.statusWidget.text = `PENDING`;
				this.statusWidget.text = `$(sync~spin) Connecting`;
				this.statusWidget.tooltip = `Connecting to the GDScript language server at ${lsp_target}`;
				break;
			case ManagerStatus.CONNECTED:
				// this.statusWidget.text = `CONNECTED`;
				this.statusWidget.text = `$(check) Connected`;
				this.statusWidget.tooltip = `Connected to the GDScript language server.`;
				break;
			case ManagerStatus.DISCONNECTED:
				// this.statusWidget.text = `DISCONNECTED`;
				this.statusWidget.text = `$(x) Disconnected`;
				this.statusWidget.tooltip = `Disconnected from the GDScript language server.`;
				break;
			case ManagerStatus.RETRYING:
				// this.statusWidget.text = `RETRYING ` + this.reconnection_attempts;
				this.statusWidget.text = `$(sync~spin) Connecting ` + this.reconnection_attempts;
				this.statusWidget.tooltip = `Connecting to the GDScript language server at ${lsp_target}`;
				break;
		}
	}

	private on_client_status_changed(status: ClientStatus) {
		switch (status) {
			case ClientStatus.PENDING:
				this.status = ManagerStatus.PENDING;
				break;
			case ClientStatus.CONNECTED:
				this.retry = false;
				set_context("connectedToLSP", true);
				this.status = ManagerStatus.CONNECTED;
				if (!this.client.started) {
					this.context.subscriptions.push(this.client.start());
				}
				break;
			case ClientStatus.DISCONNECTED:
				set_context("connectedToLSP", false);
				if (this.retry) {
					if (this.client.port != -1) {
						this.status = ManagerStatus.INITIALIZING_LSP;
					} else {
						this.status = ManagerStatus.RETRYING;
					}
				} else {
					this.status = ManagerStatus.DISCONNECTED;
				}
				this.retry = true;
				break;
			default:
				break;
		}
		this.update_status_widget();
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
		if (auto_retry && this.reconnection_attempts <= max_attempts - 1) {
			this.reconnection_attempts++;
			this.client.connect_to_server();
			this.retry = true;
			return;
		}

		this.retry = false;
		this.status = ManagerStatus.DISCONNECTED;
		this.update_status_widget();

		const lsp_target = this.get_lsp_connection_string();
		let message = `Couldn't connect to the GDScript language server at ${lsp_target}. Is the Godot editor or language server running?`;
		vscode.window.showErrorMessage(message, "Retry", "Ignore").then(item => {
			if (item == "Retry") {
				this.connect_to_language_server();
			}
		});
	}
}

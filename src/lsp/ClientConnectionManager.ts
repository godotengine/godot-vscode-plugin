import * as vscode from "vscode";
import GDScriptLanguageClient, { ClientStatus, TargetLSP } from "./GDScriptLanguageClient";
import {
	get_configuration,
	get_free_port,
	get_project_dir,
	get_project_version,
	set_context,
	register_command,
	set_configuration,
	createLogger,
	verify_godot_version,
	clean_godot_path,
} from "../utils";
import { prompt_for_godot_executable, prompt_for_reload, select_godot_executable } from "../utils/prompts";
import { subProcess, killSubProcesses } from "../utils/subspawn";

const log = createLogger("lsp.manager", { output: "Godot LSP" });

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
	public client: GDScriptLanguageClient = null;

	private reconnectionAttempts = 0;

	private target: TargetLSP = TargetLSP.EDITOR;
	private status: ManagerStatus = ManagerStatus.INITIALIZING;
	private statusWidget: vscode.StatusBarItem = null;

	private connectedVersion = "";

	constructor(private context: vscode.ExtensionContext) {
		this.context = context;

		this.client = new GDScriptLanguageClient(context);
		this.client.watch_status(this.on_client_status_changed.bind(this));

		setInterval(() => {
			this.retry_callback();
		}, get_configuration("lsp.autoReconnect.cooldown"));

		set_context("connectedToLSP", false);

		this.statusWidget = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
		this.statusWidget.command = "godotTools.checkStatus";
		this.statusWidget.show();
		this.update_status_widget();

		context.subscriptions.push(
			register_command("startLanguageServer", () => {
				// TODO: this might leave the manager in a wierd state
				this.start_language_server();
				this.reconnectionAttempts = 0;
				this.target = TargetLSP.HEADLESS;
				this.client.connect_to_server(this.target);
			}),
			register_command("stopLanguageServer", this.stop_language_server.bind(this)),
			register_command("checkStatus", this.on_status_item_click.bind(this)),
			this.statusWidget,
		);

		this.connect_to_language_server();
	}

	private async connect_to_language_server() {
		this.client.port = -1;
		this.target = TargetLSP.EDITOR;
		this.connectedVersion = undefined;

		if (get_configuration("lsp.headless")) {
			this.target = TargetLSP.HEADLESS;
			await this.start_language_server();
		}

		this.reconnectionAttempts = 0;
		this.client.connect_to_server(this.target);
	}

	private stop_language_server() {
		killSubProcesses("LSP");
	}

	private async start_language_server() {
		this.stop_language_server();

		const projectDir = await get_project_dir();
		if (!projectDir) {
			vscode.window.showErrorMessage("Current workspace is not a Godot project");
			return;
		}

		const projectVersion = await get_project_version();
		let minimumVersion = "6";
		let targetVersion = "3.6";
		if (projectVersion.startsWith("4")) {
			minimumVersion = "2";
			targetVersion = "4.2";
		}
		const settingName = `editorPath.godot${projectVersion[0]}`;
		const godotPath = clean_godot_path(get_configuration(settingName));

		const result = verify_godot_version(godotPath, projectVersion[0]);
		switch (result.status) {
			case "WRONG_VERSION": {
				const message = `Cannot launch headless LSP: The current project uses Godot v${projectVersion}, but the specified Godot executable is v${result.version}`;
				prompt_for_godot_executable(message, settingName);
				return;
			}
			case "INVALID_EXE": {
				const message = `Cannot launch headless LSP: '${godotPath}' is not a valid Godot executable`;
				prompt_for_godot_executable(message, settingName);
				return;
			}
		}
		this.connectedVersion = result.version;

		if (result.version[2] < minimumVersion) {
			const message = `Cannot launch headless LSP: Headless LSP mode is only available on v${targetVersion} or newer, but the specified Godot executable is v${result.version}.`;
			vscode.window.showErrorMessage(message, "Select Godot executable", "Open Settings", "Disable Headless LSP", "Ignore").then(item => {
				if (item === "Select Godot executable") {
					select_godot_executable(settingName);
				} else if (item === "Open Settings") {
					vscode.commands.executeCommand("workbench.action.openSettings", settingName);
				} else if (item === "Disable Headless LSP") {
					set_configuration("lsp.headless", false);
					prompt_for_reload();
				}
			});
			return;
		}

		this.client.port = await get_free_port();

		log.info(`starting headless LSP on port ${this.client.port}`);

		const headlessFlags = "--headless --no-window";
		const command = `"${godotPath}" --path "${projectDir}" --editor ${headlessFlags} --lsp-port ${this.client.port}`;
		const lspProcess = subProcess("LSP", command, { shell: true, detached: true });

		const lspStdout = createLogger("lsp.stdout");
		lspProcess.stdout.on("data", (data) => {
			const out = data.toString().trim();
			if (out) {
				lspStdout.debug(out);
			}
		});

		// const lspStderr = createLogger("lsp.stderr");
		lspProcess.stderr.on("data", (data) => {
			// const out = data.toString().trim();
			// if (out) {
			// 	lspStderr.debug(out);
			// }
		});

		lspProcess.on("close", (code) => {
			log.info(`LSP process exited with code ${code}`);
		});
	}

	private get_lsp_connection_string() {
		const host = get_configuration("lsp.serverHost");
		let port = get_configuration("lsp.serverPort");
		if (this.client.port !== -1) {
			port = this.client.port;
		}
		return `${host}:${port}`;
	}

	private on_status_item_click() {
		const lspTarget = this.get_lsp_connection_string();
		// TODO: fill these out with the ACTIONS a user could perform in each state
		switch (this.status) {
			case ManagerStatus.INITIALIZING:
				// vscode.window.showInformationMessage("Initializing extension");
				break;
			case ManagerStatus.INITIALIZING_LSP:
				// vscode.window.showInformationMessage("Initializing LSP");
				break;
			case ManagerStatus.PENDING:
				// vscode.window.showInformationMessage(`Connecting to the GDScript language server at ${lspTarget}`);
				break;
			case ManagerStatus.CONNECTED: {
				const message = `Connected to the GDScript language server at ${lspTarget}.`;

				let options = ["Ok"];
				if (this.target === TargetLSP.HEADLESS) {
					options = ["Restart LSP", ...options];
				}
				vscode.window.showInformationMessage(message, ...options).then(item => {
					if (item === "Restart LSP") {
						this.connect_to_language_server();
					}
				});
				break;
			}
			case ManagerStatus.DISCONNECTED:
				this.retry_connect_client();
				break;
			case ManagerStatus.RETRYING:
				this.show_retrying_prompt();
				break;
		}
	}

	private update_status_widget() {
		const lspTarget = this.get_lsp_connection_string();
		const maxAttempts = get_configuration("lsp.autoReconnect.attempts");
		let text = "";
		let tooltip = "";
		switch (this.status) {
			case ManagerStatus.INITIALIZING:
				text = "$(sync~spin) Initializing";
				tooltip = "Initializing extension...";
				break;
			case ManagerStatus.INITIALIZING_LSP:
				text = `$(sync~spin) Initializing LSP ${this.reconnectionAttempts}/${maxAttempts}`;
				tooltip = `Connecting to headless GDScript language server.\n${lspTarget}`;
				if (this.connectedVersion) {
					tooltip += `\n${this.connectedVersion}`;
				}
				break;
			case ManagerStatus.PENDING:
				text = "$(sync~spin) Connecting";
				tooltip = `Connecting to the GDScript language server at ${lspTarget}`;
				break;
			case ManagerStatus.CONNECTED:
				text = "$(check) Connected";
				tooltip = `Connected to the GDScript language server.\n${lspTarget}`;
				if (this.connectedVersion) {
					tooltip += `\n${this.connectedVersion}`;
				}
				break;
			case ManagerStatus.DISCONNECTED:
				text = "$(x) Disconnected";
				tooltip = "Disconnected from the GDScript language server.";
				break;
			case ManagerStatus.RETRYING:
				text = `$(sync~spin) Connecting ${this.reconnectionAttempts}/${maxAttempts}`;
				tooltip = `Connecting to the GDScript language server.\n${lspTarget}`;
				if (this.connectedVersion) {
					tooltip += `\n${this.connectedVersion}`;
				}
				break;
		}
		this.statusWidget.text = text;
		this.statusWidget.tooltip = tooltip;
	}

	private on_client_status_changed(status: ClientStatus) {
		switch (status) {
			case ClientStatus.PENDING:
				this.status = ManagerStatus.PENDING;
				break;
			case ClientStatus.CONNECTED:
				this.retry = false;
				this.reconnectionAttempts = 0;
				set_context("connectedToLSP", true);
				this.status = ManagerStatus.CONNECTED;
				if (!this.client.started) {
					this.context.subscriptions.push(this.client.start());
				}
				break;
			case ClientStatus.DISCONNECTED:
				set_context("connectedToLSP", false);
				if (this.retry) {
					if (this.client.port !== -1) {
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
		const autoRetry = get_configuration("lsp.autoReconnect.enabled");
		const maxAttempts = get_configuration("lsp.autoReconnect.attempts");
		if (autoRetry && this.reconnectionAttempts <= maxAttempts - 1) {
			this.reconnectionAttempts++;
			this.client.connect_to_server(this.target);
			this.retry = true;
			return;
		}

		this.retry = false;
		this.status = ManagerStatus.DISCONNECTED;
		this.update_status_widget();

		this.show_retrying_prompt();
	}

	private show_retrying_prompt() {
		const lspTarget = this.get_lsp_connection_string();
		const message = `Couldn't connect to the GDScript language server at ${lspTarget}. Is the Godot editor or language server running?`;

		let options = ["Retry", "Ignore"];
		if (this.target === TargetLSP.EDITOR) {
			options = ["Open workspace with Godot Editor", ...options];
		}

		vscode.window.showErrorMessage(message, ...options).then(item => {
			if (item === "Retry") {
				this.connect_to_language_server();
			}
			if (item === "Open workspace with Godot Editor") {
				vscode.commands.executeCommand("godotTools.openEditor");
				this.connect_to_language_server();
			}
		});
	}
}

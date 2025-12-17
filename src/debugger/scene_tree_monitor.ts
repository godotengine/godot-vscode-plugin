import * as vscode from "vscode";
import {
	createLogger,
	get_configuration,
	get_project_dir,
	get_project_version,
	set_context,
	verify_godot_version,
} from "../utils";
import { prompt_for_godot_executable } from "../utils/prompts";
import { killSubProcesses, subProcess } from "../utils/subspawn";
import { SceneTreeClient } from "./scene_tree_client";
import { SceneTreeProvider } from "./scene_tree_provider";

const log = createLogger("debugger.scene_tree_monitor", { output: "Godot Scene Tree" });

/**
 * High-level coordinator for Scene Tree monitoring in C# projects.
 *
 * This allows C# projects to view the Active Scene Tree by connecting
 * to Godot's debug protocol independently of the C# debugger.
 */
export class SceneTreeMonitor {
	private client: SceneTreeClient;
	private statusBarItem: vscode.StatusBarItem;
	private _isRunning = false;
	private refreshInterval?: NodeJS.Timeout;

	constructor(private sceneTree: SceneTreeProvider) {
		this.client = new SceneTreeClient();

		// Status bar item
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.statusBarItem.command = "godotTools.sceneTreeMonitor.stop";
		this.updateStatusBar();

		// Wire up events
		this.client.onConnected(() => {
			log.info("Godot connected");
			this.updateStatusBar();
			this.sceneTree.view.message = undefined;

			// Initial scene tree request
			setTimeout(() => this.client.requestSceneTree(), 500);
		});

		this.client.onDisconnected(() => {
			log.info("Godot disconnected");
			this.updateStatusBar();
			this.sceneTree.view.message = "Waiting for Godot to connect...";
		});

		this.client.onSceneTree((tree) => {
			log.info(`Received scene tree event: root="${tree?.label}", children=${tree?.children?.length ?? 0}`);
			this.sceneTree.fill_tree(tree);
			log.info("Scene tree filled in provider");
		});

		this.client.onError((error) => {
			log.error("Client error:", error);
			vscode.window.showErrorMessage(`Scene Tree Monitor error: ${error.message}`);
		});
	}

	public get isRunning(): boolean {
		return this._isRunning;
	}

	public get isConnected(): boolean {
		return this.client.isConnected;
	}

	/**
	 * Start the Scene Tree Monitor.
	 * @param launchGodot If true, also launches the Godot game with debug flags.
	 */
	public async start(launchGodot = false): Promise<void> {
		if (this._isRunning) {
			log.warn("Scene Tree Monitor is already running");
			vscode.window.showWarningMessage("Scene Tree Monitor is already running");
			return;
		}

		log.info("Starting Scene Tree Monitor");

		const configPort = get_configuration("sceneTreeMonitor.port") as number;
		const port = await this.client.start(configPort || undefined);

		this._isRunning = true;
		set_context("sceneTreeMonitor.running", true);
		this.updateStatusBar();
		this.sceneTree.view.message = "Waiting for Godot to connect...";
		this.sceneTree.view.description = "Scene Tree Monitor";

		// Set up refresh interval if configured
		const refreshMs = get_configuration("sceneTreeMonitor.refreshInterval") as number;
		if (refreshMs > 0) {
			this.refreshInterval = setInterval(() => {
				if (this.client.isConnected) {
					this.client.requestSceneTree();
				}
			}, refreshMs);
		}

		if (launchGodot) {
			await this.launchGodot(port);
		} else {
			vscode.window.showInformationMessage(
				`Scene Tree Monitor listening on port ${port}.\n` +
					`Launch Godot with: --remote-debug tcp://127.0.0.1:${port}`,
			);
		}
	}

	/**
	 * Stop the Scene Tree Monitor.
	 */
	public stop(): void {
		if (!this._isRunning) {
			return;
		}

		log.info("Stopping Scene Tree Monitor");

		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = undefined;
		}

		this.client.stop();
		this._isRunning = false;
		set_context("sceneTreeMonitor.running", false);
		this.updateStatusBar();
		this.sceneTree.clear();
		this.sceneTree.view.description = undefined;
		this.sceneTree.view.message = undefined;

		killSubProcesses("scene_tree_monitor");
	}

	/**
	 * Request a scene tree refresh.
	 */
	public refreshSceneTree(): void {
		if (this.client.isConnected) {
			this.client.requestSceneTree();
		}
	}

	/**
	 * Dispose resources.
	 */
	public dispose(): void {
		this.stop();
		this.statusBarItem.dispose();
	}

	private updateStatusBar(): void {
		if (!this._isRunning) {
			this.statusBarItem.hide();
			return;
		}

		if (this.client.isConnected) {
			this.statusBarItem.text = "$(debug-alt) Scene Tree Monitor: Connected";
			this.statusBarItem.tooltip = "Click to stop Scene Tree Monitor";
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.statusBarItem.text = "$(debug-alt) Scene Tree Monitor: Waiting...";
			this.statusBarItem.tooltip = `Waiting for Godot to connect on port ${this.client.port}\nClick to stop`;
			this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
		}
		this.statusBarItem.show();
	}

	private async launchGodot(port: number): Promise<void> {
		log.info("Launching Godot for Scene Tree Monitor");

		const settingName = "editorPath.godot4";
		let godotPath = get_configuration(settingName);
		const projectVersion = await get_project_version();
		const expectedVersion = projectVersion?.startsWith("4") ? "4" : "3";

		log.info(`Verifying version of '${godotPath}'`);
		const result = verify_godot_version(godotPath, expectedVersion);
		godotPath = result.godotPath;
		log.info(`Verification result: ${result.status}, version: "${result.version}"`);

		switch (result.status) {
			case "WRONG_VERSION": {
				const message = `Cannot start Scene Tree Monitor: The current project uses Godot v${projectVersion}, but the specified Godot executable is v${result.version}`;
				log.warn(message);
				prompt_for_godot_executable(message, settingName);
				this.stop();
				return;
			}
			case "INVALID_EXE": {
				const message = `Cannot start Scene Tree Monitor: '${godotPath}' is not a valid Godot executable`;
				log.warn(message);
				prompt_for_godot_executable(message, settingName);
				this.stop();
				return;
			}
		}

		const projectDir = await get_project_dir();
		let command = `"${godotPath}" --path "${projectDir}"`;
		command += ` --remote-debug "tcp://127.0.0.1:${port}"`;

		log.info(`Launching Godot with command: '${command}'`);
		const gameProcess = subProcess("scene_tree_monitor", command, { shell: true, detached: true });

		gameProcess.stdout.on("data", () => {});
		gameProcess.stderr.on("data", () => {});
		gameProcess.on("close", (code) => {
			log.info(`Godot process exited with code ${code}`);
		});
	}

	/**
	 * Check if Scene Tree Monitor is available for the current project.
	 * It's primarily intended for C# projects where the regular debugger
	 * doesn't provide scene tree data.
	 */
	public static async isAvailable(): Promise<boolean> {
		const projectVersion = await get_project_version();
		// Scene Tree Monitor is available for Godot 4.x projects
		return projectVersion?.startsWith("4") ?? false;
	}
}

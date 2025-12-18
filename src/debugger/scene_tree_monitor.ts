import * as vscode from "vscode";
import {
	createLogger,
	get_configuration,
	get_project_dir,
	get_project_version,
	set_context,
	verify_godot_version,
} from "../utils";
import { GodotVariable } from "./debug_runtime";
import { InspectorProvider } from "./inspector_provider";
import { prompt_for_godot_executable } from "../utils/prompts";
import { killSubProcesses, subProcess } from "../utils/subspawn";
import { InspectedObject, SceneTreeClient } from "./scene_tree_client";
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
	private pendingInspectLabel?: string;
	private currentInspectedObjectId?: bigint;
	private currentInspectedLabel?: string;

	constructor(
		private sceneTree: SceneTreeProvider,
		private inspector: InspectorProvider,
	) {
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
			// Auto-stop when Godot disconnects to reset UI and allow fresh start
			this.stop();
			vscode.window.showInformationMessage("Godot disconnected. Scene Tree Monitor stopped.");
		});

		this.client.onSceneTree((tree) => {
			log.info(`Received scene tree event: root="${tree?.label}", children=${tree?.children?.length ?? 0}`);
			this.sceneTree.fill_tree(tree);
			log.info("Scene tree filled in provider");
		});

		this.client.onInspectObject((data: InspectedObject) => {
			log.info(`Received inspect_object: class=${data.className}, props=${data.properties.size}`);
			this.fillInspector(data);
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
					// Also refresh the inspector if we have a currently inspected object
					this.refreshInspector();
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
	 * Attach to an already-running Godot instance.
	 * Use this when Godot was launched externally (e.g., by C# debugger)
	 * with --remote-debug tcp://127.0.0.1:<port>
	 */
	public async attach(): Promise<void> {
		if (this._isRunning) {
			log.warn("Scene Tree Monitor is already running");
			vscode.window.showWarningMessage("Scene Tree Monitor is already running. Stop it first.");
			return;
		}

		const configPort = get_configuration("sceneTreeMonitor.port") as number;
		const port = configPort || 6007;

		log.info(`Attaching to Godot on port ${port}`);
		this.sceneTree.view.message = "Connecting to Godot...";
		this.sceneTree.view.description = "Scene Tree Monitor (Attaching)";

		const connected = await this.client.attach("127.0.0.1", port);

		if (connected) {
			this._isRunning = true;
			set_context("sceneTreeMonitor.running", true);
			this.updateStatusBar();
			this.sceneTree.view.description = "Scene Tree Monitor";
			this.sceneTree.view.message = undefined;

			// Set up refresh interval if configured
			const refreshMs = get_configuration("sceneTreeMonitor.refreshInterval") as number;
			if (refreshMs > 0) {
				this.refreshInterval = setInterval(() => {
					if (this.client.isConnected) {
						this.client.requestSceneTree();
						// Also refresh the inspector if we have a currently inspected object
						this.refreshInspector();
					}
				}, refreshMs);
			}

			vscode.window.showInformationMessage("Connected to Godot!");
		} else {
			this.sceneTree.view.message = undefined;
			this.sceneTree.view.description = undefined;
			vscode.window.showErrorMessage(
				`Could not connect to Godot on port ${port}.\n` +
					"Make sure Godot is running with: --remote-debug tcp://127.0.0.1:" + port,
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

		// Clear inspection state
		this.clearInspection();

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
	 * Request inspection of a node by its object ID.
	 * The result will be displayed in the Inspector panel.
	 */
	public inspectObject(label: string, objectId: bigint): void {
		if (!this.client.isConnected) {
			log.warn("Cannot inspect object: not connected");
			return;
		}
		this.pendingInspectLabel = label;
		this.currentInspectedObjectId = objectId;
		this.currentInspectedLabel = label;
		this.client.requestInspectObject(objectId);
	}

	/**
	 * Refresh the currently inspected object (if any).
	 */
	public refreshInspector(): void {
		if (this.client.isConnected && this.currentInspectedObjectId !== undefined) {
			this.pendingInspectLabel = this.currentInspectedLabel;
			this.client.requestInspectObject(this.currentInspectedObjectId);
		}
	}

	/**
	 * Clear the current inspection state.
	 */
	public clearInspection(): void {
		this.currentInspectedObjectId = undefined;
		this.currentInspectedLabel = undefined;
		this.inspector.clear();
	}

	/**
	 * Fill the inspector panel with the received object data.
	 */
	private fillInspector(data: InspectedObject): void {
		// Check if the object was freed (object ID 0 or no properties typically means freed)
		if (data.objectId === BigInt(0) || (data.properties.size === 0 && data.className === "")) {
			log.info("Inspected object appears to be freed, clearing inspector");
			this.clearInspection();
			return;
		}

		// Convert RawObject properties to GodotVariable format
		const variable: GodotVariable = {
			name: this.pendingInspectLabel || data.className,
			value: {
				type_name: () => data.className,
				stringify_value: () => `<${data.objectId}>`,
				sub_values: () => {
					const subVars: GodotVariable[] = [];
					for (const [key, value] of data.properties) {
						subVars.push({ name: key, value: value });
					}
					return subVars;
				},
			},
		};

		this.inspector.fill_tree(
			this.pendingInspectLabel || data.className,
			data.className,
			Number(data.objectId),
			variable,
		);
		this.pendingInspectLabel = undefined;
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

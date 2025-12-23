import * as vscode from "vscode";
import {
	createLogger,
	get_configuration,
	get_project_version,
	set_context,
} from "../utils";
import { GodotVariable } from "./debug_runtime";
import { GameDebugControlsProvider } from "./game_debug_controls_provider";
import { killSubProcesses } from "../utils/subspawn";
import { InspectedObject, SceneTreeClient } from "./scene_tree_client";
import { SceneTreeProvider } from "./scene_tree_provider";

/**
 * Interface for inspector providers (TreeView or WebView).
 */
interface IInspectorProvider {
	fill_tree(element_name: string, class_name: string, object_id: number, variable: GodotVariable): void;
	clear(): void;
	/** Check if user is currently editing (optional - only WebView has this) */
	isCurrentlyEditing?: boolean;
}

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
		private inspector: IInspectorProvider,
		private gameDebugControls: GameDebugControlsProvider,
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
			this.gameDebugControls.updateState(true, this.client.isPaused);

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

		// Track pause state changes
		this.client.onPauseStateChanged((isPaused) => {
			log.info(`Pause state changed: ${isPaused}`);
			set_context("sceneTreeMonitor.paused", isPaused);
			this.updateStatusBar();
			this.gameDebugControls.updateState(true, isPaused);
		});
	}

	public get isRunning(): boolean {
		return this._isRunning;
	}

	public get isConnected(): boolean {
		return this.client.isConnected;
	}

	public get isPaused(): boolean {
		return this.client.isPaused;
	}

	// ========================================
	// Debug Control Methods (Tier 1 Features)
	// ========================================

	/**
	 * Pause game execution.
	 * Uses native debug protocol command - works without project modification.
	 */
	public pause(): void {
		if (!this.client.isConnected) {
			log.warn("Cannot pause: not connected");
			return;
		}
		this.client.pause();
	}

	/**
	 * Resume game execution.
	 * Uses native debug protocol command - works without project modification.
	 */
	public resume(): void {
		if (!this.client.isConnected) {
			log.warn("Cannot resume: not connected");
			return;
		}
		this.client.resume();
	}

	/**
	 * Advance exactly one frame then pause again.
	 * Requires the game to be paused first (via scene suspension).
	 */
	public nextFrame(): void {
		if (!this.client.isConnected) {
			log.warn("Cannot step frame: not connected");
			return;
		}
		if (!this.client.isPaused) {
			log.warn("Cannot step frame: game must be paused first");
			vscode.window.showWarningMessage("Cannot step frame: pause the game first");
			return;
		}
		this.client.nextFrame();
	}

	/**
	 * Set a property on a remote object.
	 * Changes are RUNTIME ONLY - scene files are not modified.
	 */
	public setObjectProperty(objectId: bigint, property: string, value: any): void {
		if (!this.client.isConnected) {
			log.warn("Cannot set property: not connected");
			return;
		}
		this.client.setObjectProperty(objectId, property, value);
	}

	/**
	 * Start the Scene Tree Monitor.
	 * Starts a TCP server that waits for Godot to connect via --remote-debug.
	 */
	public async start(): Promise<void> {
		if (this._isRunning) {
			log.warn("Scene Tree Monitor is already running");
			return;
		}

		log.info("Starting Scene Tree Monitor");

		const configPort = get_configuration("sceneTreeMonitor.port") as number;
		await this.client.start(configPort || undefined);

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
					// Skip refresh if user is currently editing a value
					if (this.inspector.isCurrentlyEditing) {
						return;
					}
					this.client.requestSceneTree();
					// Also refresh the inspector if we have a currently inspected object
					this.refreshInspector();
				}
			}, refreshMs);
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
		set_context("sceneTreeMonitor.paused", false);
		this.updateStatusBar();
		this.sceneTree.clear();
		this.sceneTree.view.description = undefined;
		this.sceneTree.view.message = undefined;
		this.gameDebugControls.updateState(false, false);

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

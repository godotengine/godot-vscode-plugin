import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, window, ThemeIcon } from "vscode";

/**
 * TreeView provider for the "Game Debug Controls" panel.
 * Provides a unified location for all game debug controls:
 * - Execution controls (Pause, Resume, Next Frame)
 * - Future: Time Scale, Audio Mute (requires helper script)
 */
export class GameDebugControlsProvider implements TreeDataProvider<DebugControlItem> {
	private changeTreeEvent = new EventEmitter<DebugControlItem | undefined>();
	onDidChangeTreeData = this.changeTreeEvent.event;

	public view: TreeView<DebugControlItem>;

	private _isRunning = false;
	private _isPaused = false;

	constructor() {
		this.view = window.createTreeView("godotTools.gameDebugControls", {
			treeDataProvider: this,
		});
	}

	/**
	 * Update the state of the debug controls based on Scene Tree Monitor status
	 */
	public updateState(isRunning: boolean, isPaused: boolean) {
		this._isRunning = isRunning;
		this._isPaused = isPaused;
		this.refresh();
	}

	public refresh() {
		this.changeTreeEvent.fire(undefined);
	}

	public getChildren(element?: DebugControlItem): DebugControlItem[] {
		if (!element) {
			// Root level - return main sections
			return this.getRootItems();
		}
		// No children for leaf items
		return [];
	}

	public getTreeItem(element: DebugControlItem): TreeItem {
		return element;
	}

	private getRootItems(): DebugControlItem[] {
		const items: DebugControlItem[] = [];

		if (!this._isRunning) {
			// Not connected - show status message
			items.push(new DebugControlItem(
				"Not Connected",
				"Start debugging to enable controls",
				TreeItemCollapsibleState.None,
				new ThemeIcon("debug-disconnect"),
				undefined
			));
		} else {
			// Connected - show execution controls
			if (this._isPaused) {
				// Show Resume button
				items.push(new DebugControlItem(
					"Resume",
					"Continue game execution (F9)",
					TreeItemCollapsibleState.None,
					new ThemeIcon("debug-continue"),
					{
						command: "godotTools.debugger.resume",
						title: "Resume Game"
					}
				));

				// Show Next Frame button
				items.push(new DebugControlItem(
					"Next Frame",
					"Advance one frame (F10)",
					TreeItemCollapsibleState.None,
					new ThemeIcon("debug-step-over"),
					{
						command: "godotTools.debugger.nextFrame",
						title: "Next Frame"
					}
				));
			} else {
				// Show Pause button
				items.push(new DebugControlItem(
					"Pause",
					"Pause game execution (F9)",
					TreeItemCollapsibleState.None,
					new ThemeIcon("debug-pause"),
					{
						command: "godotTools.debugger.pause",
						title: "Pause Game"
					}
				));
			}

			// Status indicator
			const statusText = this._isPaused ? "Game Paused" : "Game Running";
			const statusIcon = this._isPaused ? "debug-pause" : "play";
			items.push(new DebugControlItem(
				statusText,
				undefined,
				TreeItemCollapsibleState.None,
				new ThemeIcon(statusIcon),
				undefined
			));
		}

		return items;
	}
}

export class DebugControlItem extends TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string | undefined,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly iconPath: ThemeIcon | undefined,
		public readonly command: { command: string; title: string; arguments?: unknown[] } | undefined,
	) {
		super(label, collapsibleState);
		this.description = description;
		this.iconPath = iconPath;
		this.command = command;
	}
}

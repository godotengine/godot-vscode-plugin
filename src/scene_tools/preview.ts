import * as fs from "node:fs";
import * as vscode from "vscode";
import {
	type CancellationToken,
	type Event,
	EventEmitter,
	type ExtensionContext,
	type FileDecoration,
	type ProviderResult,
	type TreeDataProvider,
	type TreeDragAndDropController,
	type TreeItem,
	TreeItemCollapsibleState,
	type TreeView,
	type Uri,
	window,
	workspace,
} from "vscode";
import {
	convert_resource_path_to_uri,
	createLogger,
	find_file,
	get_configuration,
	make_docs_uri,
	register_command,
	set_context,
} from "../utils";
import { SceneParser } from "./parser";
import {
	type FuzzySearchResult,
	formatSearchResultDescription,
	formatSearchResultDetail,
	formatSearchResultLabel,
	searchNodes,
} from "./search";
import { SceneNode, type Scene } from "./types";

const log = createLogger("scenes.preview");

export class ScenePreviewProvider implements TreeDataProvider<SceneNode>, TreeDragAndDropController<SceneNode> {
	public dropMimeTypes = [];
	public dragMimeTypes = [];
	private tree: TreeView<SceneNode>;
	private scenePreviewLocked = false;
	private currentScene = "";
	public parser = new SceneParser();
	public scene: Scene;
	watcher = workspace.createFileSystemWatcher("**/*.tscn");
	uniqueDecorator = new UniqueDecorationProvider(this);
	scriptDecorator = new ScriptDecorationProvider(this);

	// Filter mode state
	private filterQuery = "";
	private filteredNodes: SceneNode[] = [];
	private isFilterMode = false;

	private changeTreeEvent = new EventEmitter<void>();
	onDidChangeTreeData = this.changeTreeEvent.event;

	constructor(private context: ExtensionContext) {
		this.tree = vscode.window.createTreeView("godotTools.scenePreview", {
			treeDataProvider: this,
			dragAndDropController: this,
		});

		context.subscriptions.push(
			register_command("scenePreview.lock", this.lock_preview.bind(this)),
			register_command("scenePreview.unlock", this.unlock_preview.bind(this)),
			register_command("scenePreview.copyNodePath", this.copy_node_path.bind(this)),
			register_command("scenePreview.copyResourcePath", this.copy_resource_path.bind(this)),
			register_command("scenePreview.openScene", this.open_scene.bind(this)),
			register_command("scenePreview.openScript", this.open_script.bind(this)),
			register_command("scenePreview.openCurrentScene", this.open_current_scene.bind(this)),
			register_command("scenePreview.openMainScript", this.open_main_script.bind(this)),
			register_command("scenePreview.goToDefinition", this.go_to_definition.bind(this)),
			register_command("scenePreview.openDocumentation", this.open_documentation.bind(this)),
			register_command("scenePreview.refresh", this.refresh.bind(this)),
			register_command("scenePreview.search", this.open_search.bind(this)),
			register_command("scenePreview.filter", this.toggle_filter_mode.bind(this)),
			register_command("scenePreview.clearFilter", this.clearFilter.bind(this)),
			window.onDidChangeActiveTextEditor(this.text_editor_changed.bind(this)),
			window.registerFileDecorationProvider(this.uniqueDecorator),
			window.registerFileDecorationProvider(this.scriptDecorator),
			this.watcher.onDidChange(this.on_file_changed.bind(this)),
			this.watcher,
			this.tree.onDidChangeSelection(this.tree_selection_changed),
			this.tree,
		);
		const result: string | undefined = this.context.workspaceState.get("godotTools.scenePreview.lockedScene");
		if (result) {
			if (fs.existsSync(result)) {
				set_context("scenePreview.locked", true);
				this.scenePreviewLocked = true;
				this.currentScene = result;
			}
		}

		this.refresh();
	}

	public handleDrag(
		source: readonly SceneNode[],
		data: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): void | Thenable<void> {
		data.set("godot/scene", new vscode.DataTransferItem(this.currentScene));
		data.set("godot/node", new vscode.DataTransferItem(source[0]));
		data.set("godot/path", new vscode.DataTransferItem(source[0].path));
		data.set("godot/relativePath", new vscode.DataTransferItem(source[0].relativePath));
		data.set("godot/class", new vscode.DataTransferItem(source[0].className));
		data.set("godot/unique", new vscode.DataTransferItem(source[0].unique));
		data.set("godot/label", new vscode.DataTransferItem(source[0].label));
	}

	public async on_file_changed(uri: vscode.Uri) {
		if (!uri.fsPath.endsWith(".tscn")) {
			return;
		}
		setTimeout(async () => {
			if (uri.fsPath === this.currentScene) {
				this.refresh();
			} else {
				const document = await vscode.workspace.openTextDocument(uri);
				this.parser.parse_scene(document);
			}
		}, 20);
	}

	public async text_editor_changed() {
		if (this.scenePreviewLocked) {
			return;
		}
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let fileName = editor.document.uri.fsPath;
			const mode = get_configuration("scenePreview.previewRelatedScenes");
			// attempt to find related scene
			if (!fileName.endsWith(".tscn")) {
				const searchName = fileName.replace(".gd", ".tscn").replace(".cs", ".tscn");

				if (mode === "anyFolder") {
					const relatedScene = await find_file(searchName);
					if (!relatedScene) {
						return;
					}
					fileName = relatedScene.fsPath;
				}

				if (mode === "sameFolder") {
					if (fs.existsSync(searchName)) {
						fileName = searchName;
					} else {
						return;
					}
				}
				if (mode === "off") {
					return;
				}
			}
			// don't attempt to parse non-scenes
			if (!fileName.endsWith(".tscn")) {
				return;
			}

			this.currentScene = fileName;
			this.refresh();
		}
	}

	public async refresh() {
		if (!fs.existsSync(this.currentScene)) {
			return;
		}

		const document = await vscode.workspace.openTextDocument(this.currentScene);
		this.scene = this.parser.parse_scene(document);

		this.tree.message = this.scene.title;

		this.changeTreeEvent.fire();
	}

	private lock_preview() {
		this.scenePreviewLocked = true;
		set_context("scenePreview.locked", true);
		this.context.workspaceState.update("godotTools.scenePreview.lockedScene", this.currentScene);
	}

	private unlock_preview() {
		this.scenePreviewLocked = false;
		set_context("scenePreview.locked", false);
		this.context.workspaceState.update("godotTools.scenePreview.lockedScene", "");
		this.refresh();
	}

	private copy_node_path(item: SceneNode) {
		if (item.unique) {
			vscode.env.clipboard.writeText(`%${item.label}`);
			return;
		}
		vscode.env.clipboard.writeText(item.relativePath);
	}

	private copy_resource_path(item: SceneNode) {
		vscode.env.clipboard.writeText(item.resourcePath);
	}

	private async open_scene(item: SceneNode) {
		const uri = await convert_resource_path_to_uri(item.resourcePath);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_script(item: SceneNode) {
		const path = this.scene.externalResources.get(item.scriptId).path;

		const uri = await convert_resource_path_to_uri(path);
		if (uri) {
			vscode.window.showTextDocument(uri, { preview: true });
		}
	}

	private async open_current_scene() {
		if (this.currentScene) {
			const document = await vscode.workspace.openTextDocument(this.currentScene);
			vscode.window.showTextDocument(document);
		}
	}

	private async open_main_script() {
		if (this.currentScene) {
			const root = this.scene.root;
			if (root?.hasScript) {
				const path = this.scene.externalResources.get(root.scriptId).path;
				const uri = await convert_resource_path_to_uri(path);
				if (uri) {
					vscode.window.showTextDocument(uri, { preview: true });
				}
			}
		}
	}

	private async go_to_definition(item: SceneNode) {
		const document = await vscode.workspace.openTextDocument(this.currentScene);
		const start = document.positionAt(item.position);
		const end = document.positionAt(item.position + item.text.length);
		const range = new vscode.Range(start, end);
		vscode.window.showTextDocument(document, { selection: range });
	}

	private async open_documentation(item: SceneNode) {
		vscode.commands.executeCommand("vscode.open", make_docs_uri(item.className));
	}

	/**
	 * Opens a QuickPick dialog for fuzzy searching nodes.
	 * Selecting a result reveals and selects the node in the tree.
	 */
	private async open_search(): Promise<void> {
		if (!this.scene?.nodes || this.scene.nodes.size === 0) {
			vscode.window.showInformationMessage("No scene loaded to search");
			return;
		}

		// Clear filter mode if active to show normal tree after selection
		if (this.isFilterMode) {
			this.clearFilter();
		}

		interface SearchQuickPickItem extends vscode.QuickPickItem {
			node: SceneNode;
		}

		const quickPick = vscode.window.createQuickPick<SearchQuickPickItem>();
		quickPick.placeholder =
			"Search nodes by name or type (e.g., 'mcoll' for MonsterController)";
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;

		// Debounce search for performance
		let searchTimeout: NodeJS.Timeout | undefined;

		quickPick.onDidChangeValue((value) => {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
			searchTimeout = setTimeout(() => {
				const results = searchNodes(this.scene, value);
				quickPick.items = results.map((r) => ({
					label: formatSearchResultLabel(r),
					description: formatSearchResultDescription(r),
					detail: formatSearchResultDetail(r),
					node: r.node,
				}));
			}, 50); // 50ms debounce
		});

		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0];
			if (selected?.node) {
				// Find the original node in the scene (not the cloned one)
				const originalNode = this.scene.nodes.get(selected.node.path);
				if (originalNode) {
					// Reveal and select the node in the tree
					this.tree.reveal(originalNode, {
						select: true,
						focus: true,
						expand: true,
					});
				}
			}
			quickPick.hide();
		});

		quickPick.onDidHide(() => {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
			quickPick.dispose();
		});

		quickPick.show();
	}

	/**
	 * Toggles filter mode on/off.
	 * When enabling, prompts for a filter query.
	 */
	private async toggle_filter_mode(): Promise<void> {
		if (this.isFilterMode) {
			this.clearFilter();
			return;
		}

		if (!this.scene?.nodes || this.scene.nodes.size === 0) {
			vscode.window.showInformationMessage("No scene loaded to filter");
			return;
		}

		const query = await vscode.window.showInputBox({
			prompt: "Filter nodes (fuzzy match on name and type)",
			placeHolder: "e.g., 'mcoll' for MonsterController",
		});

		if (query) {
			this.applyFilter(query);
		}
	}

	/**
	 * Applies a filter query and transforms the tree to show flat results.
	 * Nodes are cloned to preserve drag-and-drop functionality.
	 * Called by the filter WebView panel for real-time filtering.
	 */
	public applyFilter(query: string): void {
		this.filterQuery = query;
		this.isFilterMode = true;

		const results = searchNodes(this.scene, query);
		this.filteredNodes = results.map((r) => {
			// Clone node for flat display, preserving all properties for drag-and-drop
			const flatNode = new SceneNode(
				r.node.label as string,
				r.node.className,
				TreeItemCollapsibleState.None,
			);

			// Copy all properties needed for functionality
			flatNode.path = r.node.path;
			flatNode.relativePath = r.node.relativePath;
			flatNode.resourcePath = r.node.resourcePath;
			flatNode.parent = r.node.parent;
			flatNode.unique = r.node.unique;
			flatNode.hasScript = r.node.hasScript;
			flatNode.scriptId = r.node.scriptId;
			flatNode.position = r.node.position;
			flatNode.text = r.node.text;
			flatNode.body = r.node.body;
			flatNode.contextValue = r.node.contextValue;
			flatNode.resourceUri = r.node.resourceUri;
			flatNode.children = []; // No children in flat mode

			// Add path as description for context
			flatNode.description = `${r.node.className} - ${r.node.relativePath || "(root)"}`;

			return flatNode;
		});

		set_context("scenePreview.filterMode", true);
		this.tree.message = `Filtering: "${query}" (${this.filteredNodes.length} results)`;
		this.changeTreeEvent.fire();
	}

	/**
	 * Clears the filter and restores the hierarchical tree view.
	 * Called by the filter WebView panel when clear button is clicked.
	 */
	public clearFilter(): void {
		this.filterQuery = "";
		this.filteredNodes = [];
		this.isFilterMode = false;
		set_context("scenePreview.filterMode", false);
		this.tree.message = this.scene?.title || "";
		this.changeTreeEvent.fire();
	}

	private tree_selection_changed(event: vscode.TreeViewSelectionChangeEvent<SceneNode>) {
		// const item = event.selection[0];
		// log(item.body);
		// const editor = vscode.window.activeTextEditor;
		// const range = editor.document.getText()
		// editor.revealRange(range)
	}

	public getChildren(element?: SceneNode): ProviderResult<SceneNode[]> {
		if (!element) {
			// In filter mode, return flat filtered results
			if (this.isFilterMode) {
				return Promise.resolve(this.filteredNodes);
			}
			if (!this.scene?.root) {
				return Promise.resolve([]);
			}
			return Promise.resolve([this.scene?.root]);
		}

		// In filter mode, nodes have no children (flat list)
		if (this.isFilterMode) {
			return Promise.resolve([]);
		}

		return Promise.resolve(element.children);
	}

	public getTreeItem(element: SceneNode): TreeItem | Thenable<TreeItem> {
		if (element.children.length > 0) {
			element.collapsibleState = TreeItemCollapsibleState.Expanded;
		} else {
			element.collapsibleState = TreeItemCollapsibleState.None;
		}

		this.uniqueDecorator.update(element.resourceUri);
		this.scriptDecorator.update(element.resourceUri);

		return element;
	}
}

class UniqueDecorationProvider implements vscode.FileDecorationProvider {
	public emitter = new EventEmitter<Uri>();
	onDidChangeFileDecorations = this.emitter.event;

	update(uri: Uri) {
		this.emitter.fire(uri);
	}

	constructor(private previewer: ScenePreviewProvider) {}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node?.unique) {
			return {
				badge: "%",
			};
		}
	}
}

class ScriptDecorationProvider implements vscode.FileDecorationProvider {
	public emitter = new EventEmitter<Uri>();
	onDidChangeFileDecorations = this.emitter.event;

	update(uri: Uri) {
		this.emitter.fire(uri);
	}

	constructor(private previewer: ScenePreviewProvider) {}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== "godot") return undefined;

		const node = this.previewer.scene?.nodes.get(uri.path);
		if (node?.hasScript) {
			return {
				badge: "S",
			};
		}
	}
}

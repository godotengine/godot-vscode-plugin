import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { attemptSettingsUpdate, get_extension_uri, clean_godot_path } from "./utils";
import {
	GDInlayHintsProvider,
	GDHoverProvider,
	GDDocumentDropEditProvider,
	GDDocumentLinkProvider,
	GDSemanticTokensProvider,
	GDCompletionItemProvider,
	GDDocumentationProvider,
	GDDefinitionProvider,
	GDTaskProvider,
	GDCodeActionProvider,
} from "./providers";
import { ClientConnectionManager } from "./lsp";
import { ScenePreviewProvider } from "./scene_tools";
import { GodotDebugger } from "./debugger";
import { FormattingProvider } from "./formatter";
import {
	get_configuration,
	find_file,
	find_project_file,
	register_command,
	set_context,
	get_editor_data_dir,
	get_project_dir,
	get_project_version,
	verify_godot_version,
	convert_uri_to_resource_path,
} from "./utils";
import { prompt_for_godot_executable } from "./utils/prompts";
import { killSubProcesses, subProcess } from "./utils/subspawn";

interface Extension {
	context?: vscode.ExtensionContext;
	lsp?: ClientConnectionManager;
	debug?: GodotDebugger;
	scenePreviewProvider?: ScenePreviewProvider;
	linkProvider?: GDDocumentLinkProvider;
	dropsProvider?: GDDocumentDropEditProvider;
	hoverProvider?: GDHoverProvider;
	inlayProvider?: GDInlayHintsProvider;
	formattingProvider?: FormattingProvider;
	docsProvider?: GDDocumentationProvider;
	definitionProvider?: GDDefinitionProvider;
	semanticTokensProvider?: GDSemanticTokensProvider;
	completionProvider?: GDCompletionItemProvider;
	tasksProvider?: GDTaskProvider;
	codeActionProvider?: GDCodeActionProvider;
}

export const globals: Extension = {};

export function activate(context: vscode.ExtensionContext) {
	attemptSettingsUpdate(context);

	globals.context = context;
	globals.lsp = new ClientConnectionManager(context);
	globals.debug = new GodotDebugger(context);
	globals.scenePreviewProvider = new ScenePreviewProvider(context);
	globals.linkProvider = new GDDocumentLinkProvider(context);
	globals.dropsProvider = new GDDocumentDropEditProvider(context);
	globals.hoverProvider = new GDHoverProvider(context);
	globals.inlayProvider = new GDInlayHintsProvider(context);
	globals.formattingProvider = new FormattingProvider(context);
	globals.docsProvider = new GDDocumentationProvider(context);
	globals.definitionProvider = new GDDefinitionProvider(context);
	globals.codeActionProvider = new GDCodeActionProvider(context);
	// globals.semanticTokensProvider = new GDSemanticTokensProvider(context);
	// globals.completionProvider = new GDCompletionItemProvider(context);
	// globals.tasksProvider = new GDTaskProvider(context);

	context.subscriptions.push(
		register_command("openEditor", open_workspace_with_editor),
		register_command("openEditorSettings", open_godot_editor_settings),
		register_command("copyResourcePath", copy_resource_path),
		register_command("listGodotClasses", list_classes),
		register_command("switchSceneScript", switch_scene_script),
		register_command("getGodotPath", get_godot_path),
	);

	set_context("godotFiles", ["gdscript", "gdscene", "gdresource", "gdshader"]);
	set_context("sceneLikeFiles", ["gdscript", "gdscene"]);

	get_project_version().then(async () => {
		initial_setup();
	});
}

async function initial_setup() {
	const projectVersion = await get_project_version();
	if (projectVersion === undefined) {
		// TODO: actually handle this?
		return;
	}
	const settingName = `editorPath.godot${projectVersion[0]}`;
	const result = verify_godot_version(get_configuration(settingName), projectVersion[0]);
	const godotPath = result.godotPath;

	switch (result.status) {
		case "SUCCESS": {
			break;
		}
		case "WRONG_VERSION": {
			const message = `The specified Godot executable, '${godotPath}' is the wrong version. 
				The current project uses Godot v${projectVersion}, but the specified executable is Godot v${result.version}.
				Extension features will not work correctly unless this is fixed.`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
		case "INVALID_EXE": {
			const message = `The specified Godot executable, '${godotPath}' is invalid. 
				Extension features will not work correctly unless this is fixed.`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
	}
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		globals.lsp.client.stop();
		resolve();
	});
}

async function copy_resource_path(uri: vscode.Uri) {
	if (!uri) {
		uri = vscode.window.activeTextEditor.document.uri;
	}

	const relative_path = await convert_uri_to_resource_path(uri);

	vscode.env.clipboard.writeText(relative_path);
}

async function list_classes() {
	await globals.docsProvider.list_native_classes();
}

async function switch_scene_script() {
	let path = vscode.window.activeTextEditor.document.uri.fsPath;

	if (path.endsWith(".tscn")) {
		path = path.replace(".tscn", ".gd");
	} else if (path.endsWith(".gd")) {
		path = path.replace(".gd", ".tscn");
	}

	const file = await find_file(path);
	if (file) {
		vscode.window.showTextDocument(file);
	}
}

async function open_workspace_with_editor() {
	const projectDir = await get_project_dir();
	const projectVersion = await get_project_version();

	const settingName = `editorPath.godot${projectVersion[0]}`;
	const result = verify_godot_version(get_configuration(settingName), projectVersion[0]);
	const godotPath = result.godotPath;

	switch (result.status) {
		case "SUCCESS": {
			let command = `"${godotPath}" --path "${projectDir}" -e`;
			if (get_configuration("editor.verbose")) {
				command += " -v";
			}
			const existingTerminal = vscode.window.terminals.find((t) => t.name === "Godot Editor");
			if (existingTerminal) {
				existingTerminal.dispose();
			}
			const options: vscode.ExtensionTerminalOptions = {
				name: "Godot Editor",
				iconPath: get_extension_uri("resources/godot_icon.svg"),
				pty: new GodotEditorTerminal(command),
				isTransient: true,
			};
			const terminal = vscode.window.createTerminal(options);
			if (get_configuration("editor.revealTerminal")) {
				terminal.show();
			}
			break;
		}
		case "WRONG_VERSION": {
			const message = `Cannot launch Godot editor: The current project uses Godot v${projectVersion}, but the specified Godot executable is version ${result.version}`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
		case "INVALID_EXE": {
			const message = `Cannot launch Godot editor: '${settingName}' value of '${godotPath}' is not a valid Godot executable`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
	}
}

async function open_godot_editor_settings() {
	const dir = get_editor_data_dir();
	const files = fs.readdirSync(dir).filter((v) => v.endsWith(".tres"));

	const ver = await get_project_version();

	for (const file of files) {
		if (file.includes(ver)) {
			files.unshift(files.splice(files.indexOf(file), 1)[0]);
			break;
		}
	}

	const choices: vscode.QuickPickItem[] = [];
	for (const file of files) {
		const pick: vscode.QuickPickItem = {
			label: file,
			description: path.join(dir, file),
		};
		choices.push(pick);
	}

	vscode.window.showQuickPick(choices).then(async (item) => {
		if (item === undefined) {
			return;
		}

		const _path = path.join(dir, item.label);
		const doc = await vscode.workspace.openTextDocument(_path);
		vscode.window.showTextDocument(doc);
	});
}

/**
 * Returns the executable path for Godot based on the current project's version.
 * Created to allow other extensions to get the path without having to go
 * through the steps of determining the version to get the proper configuration
 * value (godotTools.editorPath.godot3/4).
 * @returns
 */
async function get_godot_path(): Promise<string | undefined> {
	const projectVersion = await get_project_version();
	if (projectVersion === undefined) {
		return undefined;
	}
	const settingName = `editorPath.godot${projectVersion[0]}`;
	return clean_godot_path(get_configuration(settingName));
}

class GodotEditorTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	constructor(private command: string) {}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		const proc = subProcess("GodotEditor", this.command, { shell: true, detached: true });
		this.writeEmitter.fire("Starting Godot Editor process...\r\n");

		proc.stdout.on("data", (data) => {
			const out = data.toString().trim();
			if (out) {
				this.writeEmitter.fire(`${data}\r\n`);
			}
		});

		proc.stderr.on("data", (data) => {
			const out = data.toString().trim();
			if (out) {
				this.writeEmitter.fire(`${data}\r\n`);
			}
		});

		proc.on("close", (code) => {
			this.writeEmitter.fire(`Godot Editor stopped with exit code: ${code}\r\n`);
		});
	}

	close(): void {
		killSubProcesses("GodotEditor");
	}
}

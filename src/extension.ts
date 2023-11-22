import * as path from "path";
import * as vscode from "vscode";
import { attemptSettingsUpdate } from "./utils";
import { GDDocumentLinkProvider } from "./document_link_provider";
import { GDResourceHoverProvider } from "./hover_provider";
import { ClientConnectionManager } from "./lsp";
import { ScenePreviewProvider } from "./scene_preview_provider";
import { GodotDebugger } from "./debugger";
import { FormattingProvider } from "./formatter/formatter";
import { exec, execSync } from "child_process";
import {
	get_configuration,
	find_file,
	find_project_file,
	register_command,
	get_project_version,
	set_context,
	projectDir,
	projectVersion,
} from "./utils";
import { prompt_for_godot_executable } from "./utils/prompts";

export let lspClientManager: ClientConnectionManager = null;
export let linkProvider: GDDocumentLinkProvider = null;
export let hoverProvider: GDResourceHoverProvider = null;
export let scenePreviewManager: ScenePreviewProvider = null;
export let godotDebugger: GodotDebugger = null;
export let formattingProvider: FormattingProvider = null;

export function activate(context: vscode.ExtensionContext) {
	attemptSettingsUpdate(context);

	lspClientManager = new ClientConnectionManager(context);
	linkProvider = new GDDocumentLinkProvider(context);
	hoverProvider = new GDResourceHoverProvider(context);
	scenePreviewManager = new ScenePreviewProvider(context);
	godotDebugger = new GodotDebugger(context);
	formattingProvider = new FormattingProvider(context);

	context.subscriptions.push(
		register_command("openEditor", open_workspace_with_editor),
		register_command("copyResourcePath", copy_resource_path),
		register_command("openTypeDocumentation", open_type_documentation),
		register_command("switchSceneScript", switch_scene_script),
	);

	set_context("godotFiles", ["gdscript", "gdscene", "gdresource", "gdshader",]);
	set_context("sceneLikeFiles", ["gdscript", "gdscene"]);

	get_project_version();
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		lspClientManager.client.stop();
		resolve();
	});
}

function copy_resource_path(uri: vscode.Uri) {
	if (!uri) {
		uri = vscode.window.activeTextEditor.document.uri;
	}

	const project_dir = path.dirname(find_project_file(uri.fsPath));
	if (project_dir === null) {
		return;
	}

	let relative_path = path.normalize(path.relative(project_dir, uri.fsPath));
	relative_path = relative_path.split(path.sep).join(path.posix.sep);
	relative_path = "res://" + relative_path;

	vscode.env.clipboard.writeText(relative_path);
}

function open_type_documentation() {
	lspClientManager.client.open_documentation();
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

function open_workspace_with_editor() {
	const settingName = `editorPath.godot${projectVersion[0]}`;
	const godotPath = get_configuration(settingName);

	try {
		const output = execSync(`${godotPath} --version`).toString().trim();
		const pattern = /([34])\.([0-9]+)\.(?:[0-9]+\.)?\w+.\w+.[0-9a-f]{9}/;
		const match = output.match(pattern);
		if (!match) {
			const message = `Cannot launch Godot editor: '${settingName}' of '${godotPath}' is not a valid Godot executable`;
			prompt_for_godot_executable(message, settingName);
			return;
		}
		if (match[1] !== settingName.slice(-1)) {
			const message = `Cannot launch Godot editor: The current project uses Godot v${projectVersion}, but the specified Godot executable is version ${match[0]}`;
			prompt_for_godot_executable(message, settingName);
			return;
		}
	} catch {
		const message = `Cannot launch Godot editor: ${settingName} of ${godotPath} is not a valid Godot executable`;
		prompt_for_godot_executable(message, settingName);
		return;
	}

	exec(`${godotPath} --path "${projectDir}" -e`);
}

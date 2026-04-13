import * as vscode from "vscode";

const EXTENSION_PREFIX = "godotTools";

export function get_configuration(name: string, defaultValue?: any) {
	const configValue = vscode.workspace.getConfiguration(EXTENSION_PREFIX).get(name, null);
	if (defaultValue !== undefined && configValue === null) {
		return defaultValue;
	}
	return configValue;
}

export function set_configuration(name: string, value: any) {
	return vscode.workspace.getConfiguration(EXTENSION_PREFIX).update(name, value);
}

const CONTEXT_PREFIX = `${EXTENSION_PREFIX}.context.`;

export function set_context(name: string, value: any) {
	return vscode.commands.executeCommand("setContext", CONTEXT_PREFIX + name, value);
}

export function register_command(command: string, callback: (...args: any[]) => any, thisArg?: any): vscode.Disposable {
	return vscode.commands.registerCommand(`${EXTENSION_PREFIX}.${command}`, callback, thisArg);
}

export function get_extension_uri(...paths: string[]) {
	const extension = vscode.extensions.getExtension("geequlim.godot-tools");
	if (!extension) {
		throw new Error("Extension 'geequlim.godot-tools' not found");
	}
	return vscode.Uri.joinPath(extension.extensionUri, ...paths);
}


/** 
 * Returns either a tab or spaces depending on the user config
 */
export function tabString(document?: vscode.TextDocument): string {
	const editor = vscode.window.activeTextEditor;
	const doc = document ?? editor?.document;

	if (!doc) {
		const editorConfig = vscode.workspace.getConfiguration("editor");
		const insertSpaces = editorConfig.get<boolean>("insertSpaces", true);
		const tabSize = editorConfig.get<number>("tabSize", 4);
		return insertSpaces ? " ".repeat(tabSize) : "\t";
	}

	const { insertSpaces, tabSize } = vscode.window.activeTextEditor?.options ?? {};
	const size = typeof tabSize === "number" ? tabSize : 4;
	return insertSpaces ? " ".repeat(size) : "\t";
}
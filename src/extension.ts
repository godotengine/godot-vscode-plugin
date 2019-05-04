import { ExtensionContext } from "vscode";
import GDScriptLanguageClient from "./lsp/GDScriptLanguageClient";

let client: GDScriptLanguageClient = null;

export function activate(context: ExtensionContext) {
	client = new GDScriptLanguageClient();
	context.subscriptions.push(client.start());
}

export function deactivate(): Thenable<void> {
	if (client) {
		return client.stop();
	}
	return new Promise((resolve, reject) => {});
}

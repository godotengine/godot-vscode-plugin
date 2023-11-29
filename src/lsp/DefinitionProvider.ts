import * as vscode from "vscode";
import { createLogger } from "../utils";

const log = createLogger("lsp.definitions");

export class DefinitionProvider implements vscode.DefinitionProvider {

	public data: Map<string, string> = new Map();

	constructor(private client) {
		vscode.languages.registerDefinitionProvider({ scheme: "file", language: "gdscript" }, this);
	}

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition> {
		const key = `${document.uri},${position.line},${position.character}`;
		let target = this.data.get(key);
		if (!target) {
			const key = `${document.uri},${position.line},${position.character + 1}`;
			target = this.data.get(key);
		}
		if (!target) {
			const key = `${document.uri},${position.line},${position.character - 1}`;
			target = this.data.get(key);
		}

		if (!target) {
			return null;
		}

		const parts = target.split(".");
		const uri = vscode.Uri.from({
			scheme: "gddoc",
			path: parts[0] + ".gddoc",
			fragment: parts[1],
		});

		return new vscode.Location(uri, new vscode.Position(0, 0));
	}
}

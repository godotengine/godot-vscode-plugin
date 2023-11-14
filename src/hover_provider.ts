import * as vscode from "vscode";
import {
	Position,
	TextDocument,
	CancellationToken,
} from "vscode";

export class GDResourceHoverProvider implements vscode.HoverProvider {
	constructor(private context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerHoverProvider(["gdresource", "gdscene"], this),
		);
	}

	async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<vscode.Hover> {
		const wordPattern = /(?:Ext|Sub)Resource\(\s?"?(\w+)\s?"?\)/;

		const word = document.getText(document.getWordRangeAtPosition(position));

		if (word == "ExtResource") {
			const word = document.getText(document.getWordRangeAtPosition(position, wordPattern));
			const match = word.match(wordPattern);
			const id = match[1];

			const resourceMatch = document.getText().match(`id="?${id}"?\]`);
			const p = document.positionAt(resourceMatch.index);
			const resourcePattern = /\[ext_resource.*\]/;
			const definition = document.getText(document.getWordRangeAtPosition(p, resourcePattern));

			const contents = new vscode.MarkdownString();
			contents.appendCodeblock(definition, "gdresource");
			const hover = new vscode.Hover(contents);
			return hover;
		}

		if (word == "SubResource") {
			const word = document.getText(document.getWordRangeAtPosition(position, wordPattern));
			const match = word.match(wordPattern);
			const id = match[1];

			// make sure we match a sub_resource, not an ext_resource
			const resourceMatches = document.getText().matchAll(new RegExp(`id="?${id}"?\]`, "g"));
			let resourceMatch;
			for (const match of resourceMatches) {
				const line = document.lineAt(document.positionAt(match.index).line);
				if (line.text.startsWith("[sub_resource")) {
					resourceMatch = match;
				}
			}
			const p = document.positionAt(resourceMatch.index);
			const resourcePattern = /\[sub_resource.*\]/;
			let definition = document.getText(document.getWordRangeAtPosition(p, resourcePattern));

			// get the whole sub resource definition
			let line = p.line;
			let nextLine = document.lineAt(++line);
			while (nextLine.text) {
				definition += "\n" + nextLine.text;
				nextLine = document.lineAt(++line);
			}

			// don't display contents of giant arrays
			definition = definition.replace(/Array\([0-9,\.\- ]*\)/, "Array(...)");

			const contents = new vscode.MarkdownString();
			contents.appendCodeblock(definition, "gdresource");
			const hover = new vscode.Hover(contents);
			return hover;
		}

	}
}

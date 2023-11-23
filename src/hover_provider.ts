import * as vscode from "vscode";
import {
	Position,
	TextDocument,
	CancellationToken,
} from "vscode";
import { SceneParser } from "./scene_tools";
import { convert_resource_path_to_uri, createLogger } from "./utils";

const log = createLogger("hover_provider");

export class GDResourceHoverProvider implements vscode.HoverProvider {
	public parser = new SceneParser();

	constructor(private context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerHoverProvider(
				[
					{ language: "gdresource", scheme: "file" },
					{ language: "gdscene", scheme: "file" },
					{ language: "gdscript", scheme: "file" },
				],
				this
			),
		);
	}

	async get_links(text: string): Promise<string> {
		let links = "";
		for (const match of text.matchAll(/res:\/\/[^"^']*/g)) {
			const uri = await convert_resource_path_to_uri(match[0]);
			if (uri instanceof vscode.Uri) {
				links += `* [${match[0]}](${uri})\n`;
			}
		}
		return links;
	}

	async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<vscode.Hover> {
		if (["gdresource", "gdscene"].includes(document.languageId)) {
			const wordPattern = /(?:Ext|Sub)Resource\(\s?"?(\w+)\s?"?\)/;
			const scene = this.parser.parse_scene(document);

			const word = document.getText(document.getWordRangeAtPosition(position));

			if (word == "ExtResource") {
				const word = document.getText(document.getWordRangeAtPosition(position, wordPattern));
				const match = word.match(wordPattern);
				const id = match[1];

				const definition = scene.externalResources[id].body;

				const contents = new vscode.MarkdownString();
				const links = await this.get_links(definition);
				contents.appendMarkdown(links);
				contents.appendCodeblock(definition, "gdresource");
				const hover = new vscode.Hover(contents);
				return hover;
			}

			if (word == "SubResource") {
				const word = document.getText(document.getWordRangeAtPosition(position, wordPattern));
				const match = word.match(wordPattern);
				const id = match[1];

				let definition = scene.subResources[id].body;
				// don't display contents of giant arrays
				definition = definition?.replace(/Array\([0-9,\.\- ]*\)/, "Array(...)");

				const contents = new vscode.MarkdownString();
				contents.appendCodeblock(definition, "gdresource");
				const hover = new vscode.Hover(contents);
				return hover;
			}
		}

		const link = document.getText(document.getWordRangeAtPosition(position, /res:\/\/[^"^']*/));
		if (link.startsWith("res://")) {
			let type = "";
			if (link.endsWith(".gd")) {
				type = "gdscript";
			} else if (link.endsWith(".tscn")) {
				type = "gdscene";
			} else if (link.endsWith(".tres")) {
				type = "gdresource";
			} else {
				return;
			}
		
			const uri = await convert_resource_path_to_uri(link);
			const text = (await vscode.workspace.openTextDocument(uri)).getText();
			const contents = new vscode.MarkdownString();
			contents.appendCodeblock(text, type);
			const hover = new vscode.Hover(contents);
			return hover;
		}
	}
}

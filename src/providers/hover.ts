import * as vscode from "vscode";
import {
	Position,
	TextDocument,
	CancellationToken,
} from "vscode";
import { SceneParser } from "../scene_tools";
import { convert_resource_path_to_uri, createLogger } from "../utils";

const log = createLogger("providers.hover");

export class GDHoverProvider implements vscode.HoverProvider {
	public parser = new SceneParser();

	constructor(private context: vscode.ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			vscode.languages.registerHoverProvider(selector, this),
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
			const scene = this.parser.parse_scene(document);

			const wordPattern = /(?:Ext|Sub)Resource\(\s?"?(\w+)\s?"?\)/;
			const word = document.getText(document.getWordRangeAtPosition(position, wordPattern));

			if (word.startsWith("ExtResource")) {
				const match = word.match(wordPattern);
				const id = match[1];
				const resource = scene.externalResources[id];
				const definition = scene.externalResources[id].body;
				const links = await this.get_links(definition);


				const contents = new vscode.MarkdownString();
				contents.appendMarkdown(links);
				contents.appendMarkdown("---");
				contents.appendCodeblock(definition, "gdresource");
				if (resource.type === "Script") {
					contents.appendMarkdown("---");
					const uri = await convert_resource_path_to_uri(resource.path);
					const text = (await vscode.workspace.openTextDocument(uri)).getText();
					contents.appendCodeblock(text, "gdscript");
				}
				const hover = new vscode.Hover(contents);
				return hover;
			}

			if (word.startsWith("SubResource")) {
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
			} else if (link.endsWith(".cs")) {
				type = "csharp";
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

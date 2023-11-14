import * as vscode from "vscode";
import {
	Uri,
	Position,
	Range,
	TextDocument,
	CancellationToken,
	DocumentLink,
} from "vscode";
import { convert_resource_path_to_uri } from "./utils";

export class GDDocumentLinkProvider implements vscode.DocumentLinkProvider {
	constructor(private context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerDocumentLinkProvider(["gdresource", "gdscene"], this),
		);
	}

	async provideDocumentLinks(document: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
		const text = document.getText();
		const lines = text.split("\n");

		const externalResources: Map<string, any> = new Map();
		const subResources: Map<string, any> = new Map();

		const links = [];

		let match;
		for (let i = 0; i < lines.length; i++) {
			// gather external resources
			match = lines[i].match(/\[ext_resource.*/);
			if (match) {
				const line = match[0];
				const id = line.match(/ id="?([\w]+)"?/)?.[1];
				externalResources[id] = {
					line: i + 1,
					col: match.index
				};
			}
			// gather sub resources
			match = lines[i].match(/\[sub_resource.*/);
			if (match) {
				const line = match[0];
				const id = line.match(/ id="?([\w]+)"?/)?.[1];
				subResources[id] = {
					line: i + 1,
					col: match.index
				};
			}

			// create external resource links
			match = lines[i].match(/ExtResource\(\s?"?(\w+)\s?"?\)/);
			if (match) {
				const id = match[1];
				const line = externalResources[id].line;
				const col = externalResources[id].col;
				const uri = Uri.from({
					scheme: "file",
					path: document.uri.fsPath,
					fragment: `${line},${col}`,

				});
				const r = this.create_range(i, match);
				links.push(new vscode.DocumentLink(r, uri));

			}

			// create sub resource links
			match = lines[i].match(/SubResource\(\s?"?(\w+)\s?"?\)/);
			if (match) {
				const id = match[1];
				const line = subResources[id].line;
				const col = subResources[id].col;
				const uri = Uri.from({
					scheme: "file",
					path: document.uri.fsPath,
					fragment: `${line},${col}`,

				});
				const r = this.create_range(i, match);
				links.push(new vscode.DocumentLink(r, uri));

			}

			// create resource path links
			match = lines[i].match(/res:\/\/[^"^']*/);
			if (match) {
				const r = this.create_range(i, match);
				const uri = await convert_resource_path_to_uri(match[0]);
				if (uri instanceof Uri) {
					links.push(new vscode.DocumentLink(r, uri));
				}
			}
		}
		return links;
	}

	private create_range(i, match) {
		const start = new Position(i, match.index);
		const end = new Position(i, match.index + match[0].length);
		const r = new Range(start, end);
		return r;
	}
}

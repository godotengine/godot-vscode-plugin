import * as vscode from "vscode";
import { Uri, Position, Range, TextDocument } from "vscode";
import { convert_resource_path_to_uri } from "./utils";

export class GDDocumentLinkProvider implements vscode.DocumentLinkProvider {
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		const disp = vscode.languages.registerDocumentLinkProvider(
			["gdresource"],
			this
		);

		context.subscriptions.push(disp);
	}

	async provideDocumentLinks(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[]> {
		let links = [];
		let lines = document.getText().split("\n");
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(/res:\/\/[^"^']*/);
			if (match) {
				const start = new Position(i, match.index);
				const end = new Position(i, match.index + match[0].length);
				const r = new Range(start, end);
				const uri = await convert_resource_path_to_uri(match[0]);
				if (uri instanceof Uri) {
					links.push(new vscode.DocumentLink(r, uri));
				}
			}
		}
		return links;
	}
}

import * as vscode from "vscode";
import {
	Uri,
	Range,
	type TextDocument,
	type CancellationToken,
	DocumentLink,
	type DocumentLinkProvider,
	type ExtensionContext,
} from "vscode";
import { SceneParser } from "../scene_tools";
import { convert_resource_path_to_uri, convert_uids_to_uris, createLogger } from "../utils";

const log = createLogger("providers.document_links");

export class GDDocumentLinkProvider implements DocumentLinkProvider {
	public parser = new SceneParser();

	constructor(private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			vscode.languages.registerDocumentLinkProvider(selector, this),
		);
	}

	async provideDocumentLinks(document: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
		const scene = this.parser.parse_scene(document);
		const text = document.getText();
		const path = document.uri.fsPath;

		const links: DocumentLink[] = [];

		if (["gdresource", "gdscene"].includes(document.languageId)) {
			for (const match of text.matchAll(/ExtResource\(\s?"?(\w+)\s?"?\)/g)) {
				const id = match[1];
				const uri = Uri.from({
					scheme: "file",
					path: path,
					fragment: `${scene.externalResources.get(id).line},0`,
				});

				const r = this.create_range(document, match);
				const link = new DocumentLink(r, uri);
				link.tooltip = "Jump to resource definition";
				links.push(link);
			}

			for (const match of text.matchAll(/SubResource\(\s?"?(\w+)\s?"?\)/g)) {
				const id = match[1];
				const uri = Uri.from({
					scheme: "file",
					path: path,
					fragment: `${scene.subResources.get(id).line},0`,
				});

				const r = this.create_range(document, match);
				const link = new DocumentLink(r, uri);
				links.push(link);
			}
		}
		for (const match of text.matchAll(/res:\/\/([^"'\n]*)/g)) {
			const r = this.create_range(document, match);
			const uri = await convert_resource_path_to_uri(match[0]);
			if (uri instanceof Uri) {
				links.push(new DocumentLink(r, uri));
			}
		}

		const uids: Set<string> = new Set();
		const uid_matches: Array<[string, Range]> = [];
		for (const match of text.matchAll(/uid:\/\/([0-9a-z]*)/g)) {
			const r = this.create_range(document, match);
			uids.add(match[0]);
			uid_matches.push([match[0], r]);
		}

		const uid_map = await convert_uids_to_uris(Array.from(uids));
		for (const uid of uid_matches) {
			const uri = uid_map.get(uid[0]);
			if (uri instanceof vscode.Uri) {
				links.push(new DocumentLink(uid[1], uri));
			}
		}

		return links;
	}

	private create_range(document: TextDocument, match: RegExpMatchArray) {
		const start = document.positionAt(match.index);
		const end = document.positionAt(match.index + match[0].length);
		const r = new Range(start, end);
		return r;
	}
}

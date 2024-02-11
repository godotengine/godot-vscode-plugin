import * as vscode from "vscode";
import {
	Range,
	TextDocument,
	CancellationToken,
	InlayHint,
	ProviderResult,
	InlayHintKind,
	InlayHintsProvider,
	ExtensionContext,
} from "vscode";
import { SceneParser } from "../scene_tools";
import { createLogger } from "../utils";
import { globals } from "../extension";

const log = createLogger("providers.inlay_hints");

/**
 * Returns a label from a detail string.
 * E.g. `var a: int` gets parsed to ` int `.
 */
function fromDetail(detail: string): string {
	const labelRegex = /: ([\w\d_]+)/;
	const labelMatch = detail.match(labelRegex);
	const label = labelMatch ? labelMatch[1] : "unknown";
	return ` ${label} `;
}

export class GDInlayHintsProvider implements InlayHintsProvider {
	public parser = new SceneParser();

	constructor(private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			vscode.languages.registerInlayHintsProvider(selector, this),
		);
	}

	async provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): Promise<InlayHint[]> {
		const hints: InlayHint[] = [];
		const text = document.getText();

		if (document.fileName.endsWith(".gd")) {
			await globals.lsp.client.onReady();

			// TODO: use regex only on ranges provided by the LSP (textDocument/documentSymbol)
			// since the LSP doesn't know whether a variable is inferred or not,
			// we still need to use regex to find inferred variables.

			// matches all variable declarations
			const regex = /((^|\r?\n)[\t\s]*(@?[\w\d_"()\t\s,']+([\t\s]|\r?\n)+)?(var|const)[\t\s]+)([\w\d_]+)[\t\s]*:=/g;
			
			for (const match of text.matchAll(regex)) {
				// until godot supports nested document symbols, we need to send
				// a hover request for each variable declaration
				const start = document.positionAt(match.index + match[0].length - 1);
				const hoverPosition = document.positionAt(match.index + match[1].length);
				const response = await globals.lsp.client.sendRequest("textDocument/hover", {
					textDocument: { uri: document.uri.toString() },
					position: {
						line: hoverPosition.line,
						character: hoverPosition.character,
					}
				});
				const hint = new InlayHint(start, fromDetail(response["contents"].value), InlayHintKind.Type);
				hints.push(hint);
			}
			return hints;
		}

		const scene = this.parser.parse_scene(document);

		for (const match of text.matchAll(/ExtResource\(\s?"?(\w+)\s?"?\)/g)) {
			const id = match[1];
			const end = document.positionAt(match.index + match[0].length);
			const resource = scene.externalResources[id];

			const label = `${resource.type}: "${resource.path}"`;

			const hint = new InlayHint(end, label, InlayHintKind.Type);
			hint.paddingLeft = true;
			hints.push(hint);
		}

		for (const match of text.matchAll(/SubResource\(\s?"?(\w+)\s?"?\)/g)) {
			const id = match[1];
			const end = document.positionAt(match.index + match[0].length);
			const resource = scene.subResources[id];

			const label = `${resource.type}`;

			const hint = new InlayHint(end, label, InlayHintKind.Type);
			hint.paddingLeft = true;
			hints.push(hint);
		}

		return hints;
	}
}

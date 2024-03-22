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
import { createLogger, get_configuration } from "../utils";
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

async function addByHover(document: TextDocument, hoverPosition: vscode.Position, start: vscode.Position): Promise<InlayHint | undefined> {
	const response = await globals.lsp.client.sendRequest("textDocument/hover", {
		textDocument: { uri: document.uri.toString() },
		position: {
			line: hoverPosition.line,
			character: hoverPosition.character,
		}
	});

	// check if contents is an empty array; if it is, we have no hover information
	if (Array.isArray(response["contents"]) && response["contents"].length === 0) {
		return undefined;
	}

	return new InlayHint(start, fromDetail(response["contents"].value), InlayHintKind.Type);
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
		const text = document.getText(range);

		if (document.fileName.endsWith(".gd")) {
			if (!get_configuration("inlayHints.gdscript", true)) {
				return hints;
			}

			await globals.lsp.client.onReady();

			const symbolsRequest = await globals.lsp.client.sendRequest("textDocument/documentSymbol", {
				textDocument: { uri: document.uri.toString() },
			}) as unknown[];

			if (symbolsRequest.length === 0) {
				return hints;
			}

			const symbols = (typeof symbolsRequest[0] === "object" && "children" in symbolsRequest[0])
				? (symbolsRequest[0].children as unknown[]) // godot 4.0+ returns an array of children
				: symbolsRequest; // godot 3.2 and below returns an array of symbols

			const hasDetail = symbols.some((s: any) => s.detail);

			// TODO: make sure godot reports the correct location for variable declaration symbols
			// (allowing the use of regex only on ranges provided by the LSP (textDocument/documentSymbol))

			// since neither LSP or the grammar know whether a variable is inferred or not,
			// we still need to use regex to find all inferred variable declarations.
			const regex = /((var|const)\s+)([\w\d_]+)\s*:=/g;
			
			for (const match of text.matchAll(regex)) {
				if (token.isCancellationRequested) break;
				// TODO: until godot supports nested document symbols, we need to send
				// a hover request for each variable declaration that is nested
				const start = document.positionAt(match.index + match[0].length - 1);
				const hoverPosition = document.positionAt(match.index + match[1].length);

				if (hasDetail) {
					const symbol = symbols.find((s: any) => s.name === match[3]);
					if (symbol && symbol["detail"]) {
						const hint = new InlayHint(start, fromDetail(symbol["detail"]), InlayHintKind.Type);
						hints.push(hint);
					} else {
						const hint = await addByHover(document, hoverPosition, start);
						if (hint) {
							hints.push(hint);
						}
					}
				} else {
					const hint = await addByHover(document, hoverPosition, start);
					if (hint) {
						hints.push(hint);
					}
				}
			}
			return hints;
		}

		if (!get_configuration("inlayHints.gdresource", true)) {
			return hints;
		}

		const scene = await this.parser.parse_scene(document);

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

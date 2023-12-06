import * as vscode from "vscode";
import {
	Uri,
	Position,
	Range,
	TextDocument,
	CancellationToken,
	ExtensionContext,
	DocumentSemanticTokensProvider,
	SemanticTokens,
	SemanticTokensLegend,
	SemanticTokensBuilder,
} from "vscode";
import { createLogger } from "../utils";

const log = createLogger("providers.tokens");

export class GDSemanticTokensProvider implements DocumentSemanticTokensProvider {
	private legend = new SemanticTokensLegend(
		[
			"nodePath",
			"%",
		],
		["test"],
	);

	constructor(private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];

		context.subscriptions.push(
			vscode.languages.registerDocumentSemanticTokensProvider(selector, this, this.legend),
		);
	}

	async provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken): Promise<SemanticTokens> {
		log.debug("provideDocumentSemanticTokens");
		const builder = new SemanticTokensBuilder(this.legend);
		const text = document.getText();

		const pattern = /(?<=(?:get_node|has_node|find_node|get_node_or_null|has_node_and_resource)\(\s?)(("|')((?!\2).)*\2)(?=\s?\))/g;
		for (const match of text.matchAll(pattern)) {
			const r = this.create_range(document, match);
			builder.push(r, "nodePath", []);
		}

		return builder.build();
	}

	private create_range(document: TextDocument, match: RegExpMatchArray) {
		const start = document.positionAt(match.index);
		const end = document.positionAt(match.index + match[0].length);
		const r = new Range(start, end);
		return r;
	}
}

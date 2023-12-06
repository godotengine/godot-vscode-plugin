import * as vscode from "vscode";
import {
	Uri,
	Position,
	Range,
	TextDocument,
	CancellationToken,
	ProviderResult,
	CompletionContext,
	CompletionList,
	CompletionItem,
	CompletionItemProvider,
	ExtensionContext,
} from "vscode";
import { createLogger } from "../utils";

const log = createLogger("providers.completions");

export class GDCompletionItemProvider implements CompletionItemProvider {
	constructor(private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(
			vscode.languages.registerCompletionItemProvider(selector, this),
		);
	}

	provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[] | CompletionList<CompletionItem>> {
		const items = [];

		const linePrefix = document.lineAt(position).text.slice(0, position.character);

		log.debug("provideCompletionItems");
		log.debug("linePrefix", linePrefix);

		return items;
	}
}

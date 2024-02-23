import * as vscode from "vscode";
import {
	Uri,
	Position,
	TextDocument,
	CancellationToken,
	Location,
	Definition,
	DefinitionProvider,
	ExtensionContext,
} from "vscode";
import { make_docs_uri, createLogger } from "../utils";
import { globals } from "../extension";

const log = createLogger("providers.definitions");

export class GDDefinitionProvider implements DefinitionProvider {
	constructor(private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];

		context.subscriptions.push(
			vscode.languages.registerDefinitionProvider(selector, this),
		);
	}

	async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
		if (["gdresource", "gdscene"].includes(document.languageId)) {
			const range = document.getWordRangeAtPosition(position, /(\w+)/);
			if (range) {
				const word = document.getText(range);
				if (globals.docsProvider.classInfo.has(word)) {
					const uri = make_docs_uri(word);
					return new Location(uri, new Position(0, 0));
				} else {
					let i = 0;
					let line;
					let match;

					do {
						line = document.lineAt(position.line - i++);
						match = line.text.match(/(?<=type)="(\w+)"/);
					} while (!match && line.lineNumber > 0);

					if (globals.docsProvider.classInfo.has(match[1])) {
						const uri = make_docs_uri(match[1], word);
						return new Location(uri, new Position(0, 0));
					}
				}
			}

			return null;
		}

		const target = await globals.lsp.client.get_symbol_at_position(document.uri, position);

		if (!target) {
			return null;
		}

		const parts = target.split(".");
		const uri = make_docs_uri(parts[0], parts[1]);

		return new Location(uri, new Position(0, 0));
	}
}

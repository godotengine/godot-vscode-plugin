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
import { createLogger } from "../utils";

const log = createLogger("providers.definitions");

export class GDDefinitionProvider implements DefinitionProvider {
	constructor(private client, private context: ExtensionContext) {
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
				const uri = this.make_uri(word);
				return new Location(uri, new Position(0, 0));
			}

			return null;
		}

		const target = await this.client.get_symbol_at_position(document.uri, position);

		if (!target) {
			return null;
		}
		
		const parts = target.split(".");
		const uri = this.make_uri(parts[0], parts[1]);

		return new Location(uri, new Position(0, 0));
	}

	make_uri(path: string, fragment?: string) {
		return Uri.from({
			scheme: "gddoc",
			path: path + ".gddoc",
			fragment: fragment,
		});
	}
}

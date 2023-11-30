import * as vscode from "vscode";
import {
	TextDocument,
	CancellationToken,
	Location,
	Definition,
	DefinitionProvider,
	TypeDefinitionProvider,
	Position,
	ExtensionContext,
	Uri,
} from "vscode";
import { createLogger } from "../utils";

const log = createLogger("providers.definitions");

export class GDDefinitionProvider implements DefinitionProvider, TypeDefinitionProvider {
	public data: Map<string, string> = new Map();

	constructor(private client, private context: ExtensionContext) {
		const selector = [
			{ language: "gdresource", scheme: "file" },
			{ language: "gdscene", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];

		context.subscriptions.push(
			vscode.languages.registerDefinitionProvider(selector, this),
			vscode.languages.registerTypeDefinitionProvider(selector, this),
		);
	}

	async provideTypeDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
		return this.provideDefinition(document, position, token);
	}

	async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
		if (["gdresource", "gdscene"].includes(document.languageId)) {
			const range = document.getWordRangeAtPosition(position, /(\w+)/);
			if (range) {
				const word = document.getText(range);
				// if () {

				// }
				const uri = this.make_uri(word);

				return new Location(uri, new Position(0, 0));
			}

			return null;
		}

		const key = `${document.uri},${position.line},${position.character}`;
		let target = this.data.get(key);
		if (!target) {
			const key = `${document.uri},${position.line},${position.character + 1}`;
			target = this.data.get(key);
		}
		if (!target) {
			const key = `${document.uri},${position.line},${position.character - 1}`;
			target = this.data.get(key);
		}

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

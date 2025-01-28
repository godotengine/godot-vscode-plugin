import * as vscode from "vscode";
import {
	CancellationToken,
	DataTransfer,
	DocumentDropEdit,
	DocumentDropEditProvider,
	ExtensionContext,
	languages,
	Position,
	ProviderResult,
	Range,
	TextDocument,
	Uri,
} from "vscode";
import { createLogger, node_name_to_snake, projectVersion } from "../utils";

const log = createLogger("providers.drops");

export class GDDocumentDropEditProvider implements DocumentDropEditProvider {
	constructor(private context: ExtensionContext) {
		const dropEditSelector = [
			{ language: "csharp", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(languages.registerDocumentDropEditProvider(dropEditSelector, this));
	}

	public provideDocumentDropEdits(
		document: TextDocument,
		position: Position,
		dataTransfer: DataTransfer,
		token: CancellationToken,
	): ProviderResult<DocumentDropEdit> {
		// log.debug("provideDocumentDropEdits", document, dataTransfer);

		// const origin = dataTransfer.get("text/plain").value;
		// log.debug(origin);

		// TODO: compare the source scene to the target file
		// What should happen when you drag a node into a script that isn't the
		// "main" script for that scene?
		// Attempt to calculate a relative path that resolves correctly?

		const className: string = dataTransfer.get("godot/class")?.value;
		if (className) {
			const path: string = dataTransfer.get("godot/path")?.value;
			const unique = dataTransfer.get("godot/unique")?.value === "true";
			const label: string = dataTransfer.get("godot/label")?.value;

			// For the root node, the path is empty and needs to be replaced with the node name
			const savePath = path || label;

			if (document.languageId === "gdscript") {
				let qualifiedPath = `$${savePath}`;

				if (unique) {
					// For unique nodes, we can use the % syntax and drop the full path
					qualifiedPath = `%${label}`;
				}

				const line = document.lineAt(position.line);
				if (line.text === "") {
					// We assume that if the user is dropping a node in an empty line, they are at the top of
					// the script and want to declare an onready variable

					const snippet = new vscode.SnippetString();

					if (projectVersion?.startsWith("4")) {
						snippet.appendText("@");
					}
					snippet.appendText("onready var ");
					snippet.appendPlaceholder(node_name_to_snake(label));
					snippet.appendText(`: ${className} = ${qualifiedPath}`);
					return new vscode.DocumentDropEdit(snippet);
				}

				// In any other place, we assume the user wants to get a reference to the node itself
				return new vscode.DocumentDropEdit(qualifiedPath);
			}

			if (document.languageId === "csharp") {
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${savePath}")`);
			}
		}
	}
}

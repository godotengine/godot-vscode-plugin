import * as vscode from "vscode";
import { format_document } from "./textmate";
import { createLogger } from "../utils";

const log = createLogger("formatter");

export class FormattingProvider implements vscode.DocumentFormattingEditProvider {
	constructor(private context: vscode.ExtensionContext) {
		const selector = { language: "gdscript", scheme: "file" };

		context.subscriptions.push(
			vscode.languages.registerDocumentFormattingEditProvider(selector, this),
		);
	}

	public provideDocumentFormattingEdits(document: vscode.TextDocument) {
		return format_document(document);
	}
}

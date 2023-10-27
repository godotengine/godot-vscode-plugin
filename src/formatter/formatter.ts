import * as vscode from "vscode";
import {
	DocumentFormattingEditProvider,
	ExtensionContext,
	TextDocument,
	TextEdit,
} from "vscode";
import { execSync } from "child_process";
import { get_configuration } from "../utils";
import { createLogger } from "../logger";

const log = createLogger("formatter");

export class FormattingProvider implements DocumentFormattingEditProvider {
	constructor(context: ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerDocumentFormattingEditProvider('gdscript', this),
		)
	}

	async provideDocumentFormattingEdits(document: TextDocument): Promise<TextEdit[]> {
		return new Promise((res, rej) => {
			const formatter = get_configuration("formatter");

			if (formatter === "gdformat") {
				const formatterPath = get_configuration(`${formatter}Path`);
				const command = `${formatterPath} ${document.uri.fsPath}`;
				const output = execSync(`${command} `);
				// TODO: error handling
				res([]);
				return;
			}
			if (formatter === "builtin") {
				// Not implemented yet
				// const command = `${formatterPath} ${document.uri.fsPath}`;
				// const output = execSync(`${command} `);
				// res([]);
			}
			rej();
		});
	}
}

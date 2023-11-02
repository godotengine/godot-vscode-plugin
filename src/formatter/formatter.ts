import * as vscode from "vscode";
import {
	DocumentFormattingEditProvider,
	ExtensionContext,
	TextDocument,
	TextEdit,
} from "vscode";
import { execSync } from "child_process";
import { get_configuration } from "../utils";
import { parser } from "./parser.js"
import { createLogger } from "../logger";

const log = createLogger("formatter");


function format_document(document: TextDocument) {
	const text = document.getText();
	const tree = parser.parse(text);

	const cursor = tree.cursor();

	let output = "";

	cursor.iterate((node) => {

		if (node.name === "Script" || node.name === "FunctionDefinition" || node.name === "Body" || node.name === "ParamList" || node.name.includes("Statement") || node.name.includes("Expression")) {
			return;
		}
		log.debug(node.name, text.slice(node.from, node.to));

		// switch (node.name) {
		// 	case value:

		// 		break;

		// 	default:
		// 		break;
		// }
		output += text.slice(node.from, node.to);
	});


	log.debug("Output:\n", output);
}


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
				format_document(document);
			}
			rej();
		});
	}
}

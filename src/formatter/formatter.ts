import * as vscode from "vscode";
import {
	TextDocument,
	TextEdit,
	DocumentFormattingEditProvider,
	ExtensionContext,
	Range,
	Position,
} from "vscode";
import { tokenize } from "./tokenizer";
import { createLogger } from "../utils";

const log = createLogger("formatter");

export function format_document(document: TextDocument): TextEdit[] {
	const edits: TextEdit[] = [];
	let inString;
	let stringType: "single" | "double" | null = null;
	let lastLine = "";
	for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
		const line = document.lineAt(lineNum);
		if (inString) {
			if (stringType === "double" && line.text.includes("\"\"\"")) {
				stringType = null;
				inString = false;
			}
			if (stringType === "single" && line.text.includes("'''")) {
				stringType = null;
				inString = false;
			}
			continue;
		}
		const tokens = tokenize(line.text);
		// TODO: figure out how to handle leading whitespace correctly
		// const leadingWhitespace = tokens[0].replace("    ", "\t");
		const leadingWhitespace = tokens[0];
		tokens.shift();
		const newLine = (leadingWhitespace + tokens.join("")).trimEnd();

		if (lastLine === "" && newLine === "") {
			const start = new Position(line.range.start.line - 1, line.range.start.character);
			const end = new Position(line.range.end.line, line.range.end.character);
			const range = new Range(start, end);
			edits.push(TextEdit.delete(range));
		} else if (line.text !== newLine) {
			edits.push(TextEdit.replace(line.range, newLine));
		}
		const lastToken = tokens.pop();
		lastLine = newLine;
		if (lastToken) {
			if (lastToken.includes("\"\"\"") && !lastToken.includes("\"\"\"", 3)) {
				inString = true;
				stringType = "double";
			}
			if (lastToken.includes("'''") && !lastToken.includes("'''", 3)) {
				inString = true;
				stringType = "single";
			}
		}
	}
	return edits;
}

export class FormattingProvider implements DocumentFormattingEditProvider {
	constructor(private context: ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerDocumentFormattingEditProvider(
				{ language: "gdscript", scheme: "file" },
				this,
			),
		);
	}

	public provideDocumentFormattingEdits(document: vscode.TextDocument) {
		return format_document(document);
	}
}

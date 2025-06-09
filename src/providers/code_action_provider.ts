import * as vscode from "vscode";
import {
	ExtensionContext
} from "vscode";
import { tabString } from "../utils";
/**
 * @param $1 The variable name (including the : if it has it),
 * @param $2 The variable type,
 * @param $3 Everything else after the type
 */
const VARIABLE_REGEXP: RegExp = /^var\s*(\w+:?)\s*\s*(\w*)([\s\S\w\W]*)/;

export class GDCodeActionProvider implements vscode.CodeActionProvider {
	constructor(private context: ExtensionContext) {
		context.subscriptions.push(
			vscode.languages.registerCodeActionsProvider(
				{ language: 'gdscript' },
				this,
				{
					providedCodeActionKinds: GDCodeActionProvider.providedCodeActionKinds,
				}
			)
		);

	}
	// Define the kind of code actions this provider offers
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.Refactor,
		vscode.CodeActionKind.RefactorExtract,
		vscode.CodeActionKind.RefactorRewrite,
		vscode.CodeActionKind.RefactorInline,
	];

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.CodeAction[]> {

		// Specify the edits to be applied
		const _exportTheseVariables = exportTheseVariables(document);
		const _extractFunction = extractFunction(document);
		const _extractVariable = extractVariable(document);

		const _addExportToVariable = addExportToVariable(range, document);
		const _addRangeExportToVariable = addRangeExportToVariable(range, document);

		return [_extractVariable, _extractFunction, _exportTheseVariables, _addExportToVariable, _addRangeExportToVariable];
	}


}



function addExportToVariable(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text;

	const exec: RegExpExecArray | null = VARIABLE_REGEXP.exec(lineText);
	if (!exec) {
		return undefined;
	}

	const codeAction = new vscode.CodeAction(
		"Export this variable",
		vscode.CodeActionKind.RefactorInline
	);


	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(VARIABLE_REGEXP, "@export var $1 $2 $3");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);

	return codeAction;
}

function addRangeExportToVariable(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	const exec: RegExpExecArray | null = VARIABLE_REGEXP.exec(lineText);
	if (!exec) {
		return undefined;
	}

	const [_, name, type, body] = exec;

	const is_number = type.trim() === "float" || type.trim() === "int";
	if (!is_number) return undefined;

	const codeAction = new vscode.CodeAction(
		"Export as a range",
		vscode.CodeActionKind.RefactorInline
	);

	codeAction.edit = new vscode.WorkspaceEdit();
	let updatedText = "";

	if (type.trim() === "float") {
		updatedText = lineText.replace(VARIABLE_REGEXP, `@export_range(0.0, 1.0) var ${name} ${type} ${body}`);
	} else {
		updatedText = lineText.replace(VARIABLE_REGEXP, `@export_range(0, 1) var ${name} ${type} ${body}`);
	}

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);
	codeAction.isPreferred = true;
	return codeAction;
}

function extractVariable(document: vscode.TextDocument) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return undefined;
	const selectedText = document.getText(editor.selection);
	if (selectedText === "") return undefined;
	const codeAction = new vscode.CodeAction(
		"Extract Variable",
		vscode.CodeActionKind.RefactorExtract,
	);


	// codeAction.edit.replace(
	// 	document.uri,
	// 	startLine.range,
	// 	updatedText
	// );
	// codeAction.command = {
	// 	command: "godotTools.extractVariable",
	// 	title: "Extract selected as a variable"
	// };
	return codeAction;
}

function extractFunction(document: vscode.TextDocument) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return undefined;
	const selectedText = document.getText(editor.selection);
	if (selectedText === "") return undefined;
	const codeAction = new vscode.CodeAction(
		"Extract function",
		vscode.CodeActionKind.RefactorExtract,
	);
	const tabOrSpace = tabString();
	// TODO: Maybe look for another name because if by any chance the user has this exact function name, it will mess things up
	const functionName = "_new_function";
	const newFunction: string = `func ${functionName}():\n${selectedText
		.split("\n")
		.map((line) => tabOrSpace + line)
		.join("\n")}\n`;
	/**
	 * Look in each line, starting with this one and go down,
	 * if you find a line with a method declaration, go up one and paste the new function
	 * or the end of the document
	 */
	let pasteLine: number = editor.selection.end.line;

	for (let i = 0; i < document.lineCount; i++) {
		if (i < pasteLine) continue;
		const textLine = document.lineAt(i);

		if (textLine.text.trim().startsWith("func")) {
			break;
		} else {
			pasteLine++;
		}
	}
	const position = new vscode.Position(Math.min(pasteLine, document.lineCount), 0);

	const edit = new vscode.WorkspaceEdit();

	const callNewFunction = vscode.SnippetTextEdit.replace(
		editor.selection,
		new vscode.SnippetString(`${functionName}$0()`)
	);
	const insertNewFunction = vscode.TextEdit.insert(
		position, `\n${newFunction}`
	);

	edit.set(document.uri, [
		callNewFunction,
		insertNewFunction
	]);

	codeAction.edit = edit;

	codeAction.command = {
		command: "editor.action.rename",
		title: "Rename the new function"
	};

	return codeAction;
}

// TODO: When everything is done, this should export them to their designated exports
function exportTheseVariables(document: vscode.TextDocument): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export these variables",
		vscode.CodeActionKind.RefactorRewrite,
	);
	const editor = vscode.window.activeTextEditor;
	const selectedText = document.getText(editor.selection);

	if (selectedText === "") return undefined;

	const individualLines = selectedText.split("\n");

	let updatedText: string[] = [];
	let nonVarElements = 0;
	let varElements = 0;

	for (let i = 0; i < individualLines.length; i++) {
		const element = individualLines[i];

		if (!element.startsWith("var ")) {
			updatedText = updatedText.concat(element);
			nonVarElements++;
			continue;
		}
		updatedText = updatedText.concat(element.replace(/^var/, "@export var"));
		varElements++;
	}

	if (varElements < 1) return undefined;

	const newText: string = updatedText.join("\n");
	codeAction.edit = new vscode.WorkspaceEdit();
	codeAction.edit.replace(
		document.uri,
		editor.selection,
		newText,
	);
	codeAction.isPreferred = true;
	return codeAction;
}

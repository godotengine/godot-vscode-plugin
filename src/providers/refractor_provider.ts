import * as vscode from "vscode";
import { integer } from "vscode-languageclient";

/**
 * @param $1 The variable name (including the : if it has it),
 * @param $2 The variable type,
 * @param $3 Everything else after the type
 */
const VARIABLE_REGEXP: RegExp = /var\s*(\w+:?)\s*\s*(\w*)([\s\S\w\W]*)/

export class RefactorCodeActionProvider implements vscode.CodeActionProvider {
	// Define the kind of code actions this provider offers
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.Refactor,
	];

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.CodeAction[]> {

		// Specify the edits to be applied
		var _exportTheseVariables = exportTheseVariables(document);
		var _handleDifferentVariableExports = handleDifferentTypedVariableExports(range, document);

		return [..._handleDifferentVariableExports, _exportTheseVariables];
	}


}

function addExportToVariable(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export this variable",
		vscode.CodeActionKind.RefactorInline
	);
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(VARIABLE_REGEXP, "@export var $1 $2 $3");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);

	return codeAction;
}

function addRangeExportToVariable(range: vscode.Range, document: vscode.TextDocument,
	name: string,
	type: string,
	body: string,
): vscode.CodeAction {
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	const is_number = type.trim() === "float" || type.trim() === "int";
	if (!is_number) return;

	const codeAction = new vscode.CodeAction(
		"Export as a range",
		vscode.CodeActionKind.RefactorInline
	);

	codeAction.edit = new vscode.WorkspaceEdit();
	var updatedText = "";

	if (type.trim() == "float") {
		updatedText = lineText.replace(VARIABLE_REGEXP, `@export_range(0.0, 1.0) var ${name} ${type} ${body}`);
	} else {
		updatedText = lineText.replace(VARIABLE_REGEXP, `@export_range(0, 1) var ${name} ${type} ${body}`);
	}

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);
	codeAction.isPreferred = true
	return codeAction
}


/**
 * For Variables that only checks for the type.
 * It makes a single execution and passes down the results, furthermore ,
 * since the functions are only in variables, we exit early if the line is NOT a variable
 * @param range 
 * @param document 
 * @returns 
 */
function handleDifferentTypedVariableExports(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction[] {
	var actions: vscode.CodeAction[] = [];

	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	const exec: RegExpExecArray | null = VARIABLE_REGEXP.exec(lineText)
	if (!exec) {
		return undefined
	}

	const [_, name, type, body] = exec;

	var _addExportToVariable = addExportToVariable(range, document);
	var _addRageExportToVariable = addRangeExportToVariable(range, document, name, type, body);

	actions.push(_addExportToVariable, _addRageExportToVariable)

	return actions;
}

// function exportColorNoAlpha(
// 	range: vscode.Range,
// 	document: vscode.TextDocument,
// 	name: string,
// 	type: string,
// 	body: string,
// ): vscode.CodeAction {
// 	if (type !== "Color") return;
// 	const codeAction = new vscode.CodeAction(
// 		"Export as Color No Alpha",
// 		vscode.CodeActionKind.RefactorRewrite,
// 	);



// 	return;
// }

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

	var updatedText: String[] = [];

	for (let i = 0; i < individualLines.length; i++) {
		const element = individualLines[i];

		if (!element.startsWith("var ")) {
			updatedText = updatedText.concat(element);
			continue;
		}
		updatedText = updatedText.concat(element.replace(/^var/, "@export var"));
	}

	if (updatedText.length <= 0) return undefined;

	var newText: string = updatedText.join("\n");
	codeAction.edit = new vscode.WorkspaceEdit();
	codeAction.edit.replace(
		document.uri,
		editor.selection,
		newText,
	)
	codeAction.isPreferred = true;
	return codeAction
}



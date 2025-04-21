import * as vscode from "vscode";

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
		var _addExportToVariable = addExportToVariable(range, document);
		var _addRageExportToVariable = addRangeExportToVariable(range, document);

		return [_addExportToVariable, _addRageExportToVariable];
	}


}

function addExportToVariable(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export this variable",
		vscode.CodeActionKind.RefactorInline
	);
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	if (!lineText.startsWith("var ")) {
		return undefined;
	}

	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(/^var/, "@export var");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);

	return codeAction;
}

function addRangeExportToVariable(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const editor = vscode.window.activeTextEditor;
	const REGEX: RegExp = /^var\s*(\w+)\s*:\s*(float|int)/
	const startLine = document.lineAt(range.start.line);
	const lineText = startLine.text.trim();

	const exec: RegExpExecArray | null = REGEX.exec(lineText)


	if (!exec) {
		return undefined
	}

	const codeAction = new vscode.CodeAction(
		"Export as a range",
		vscode.CodeActionKind.RefactorInline
	);
	codeAction.edit = new vscode.WorkspaceEdit();


	const updatedText = lineText.replace(REGEX, "@export_range(0, 1) var $1: $2");
	// const snipperString = new vscode.SnippetString(updatedText.replace("export_range(0, 1)", "@export_range(${1:0}, ${2:0})"))

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);
	// editor.insertSnippet(snipperString, startLine.range)
	// Move the cursor to the specified position
	// const newPosition = new vscode.Position(startLine.lineNumber, character);
	// editor.selection = new vscode.Selection(newPosition, newPosition);
	// editor.revealRange(new vscode.Range(newPosition, newPosition));

	return codeAction
}

function groupExportedProperties(lineText: string, document: vscode.TextDocument, startLine: vscode.TextLine): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Group exports",
		vscode.CodeActionKind.RefactorInline
	);
	var editor = vscode.window.activeTextEditor;
	const selectedText = editor.document.getText(editor.selection);

	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(/^var\s*(\w+)\s*:\s*(float|int)/, "@export_range(0, 1) var $1: $2");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);
	return codeAction
}


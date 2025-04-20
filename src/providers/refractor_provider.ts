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
		const startLine = document.lineAt(range.start.line);
		const lineText = startLine.text.trim();

		// Only show the action if the line starts with "var"
		if (!lineText.startsWith("var ")) {
			return undefined;
		}

		// Specify the edits to be applied
		var _addExportToVariable = addExportToVariable(lineText, document, startLine);
		var _addRageExportToVariable = addRangeExportToVariable(lineText, document, startLine);

		return [_addExportToVariable, _addRageExportToVariable];
	}
}

function addExportToVariable(lineText: string, document: vscode.TextDocument, startLine: vscode.TextLine): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export this variable",
		vscode.CodeActionKind.RefactorInline
	);

	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(/^var/, "@export var");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);

	return codeAction;
}

function addRangeExportToVariable(lineText: string, document: vscode.TextDocument, startLine: vscode.TextLine): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export as a range",
		vscode.CodeActionKind.RefactorInline
	);
	codeAction.edit = new vscode.WorkspaceEdit();

	const updatedText = lineText.replace(/^var\s*(\w+)\s*:\s*(float|int)/, "@export_range(0, 1) var $1: $2");

	codeAction.edit.replace(
		document.uri,
		startLine.range,
		updatedText
	);
	return codeAction
}

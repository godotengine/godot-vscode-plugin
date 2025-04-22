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
		var _exportTheseVariables = exportTheseVariables(range, document)

		return [_addExportToVariable, _addRageExportToVariable, _exportTheseVariables];
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

function exportTheseVariables(range: vscode.Range, document: vscode.TextDocument): vscode.CodeAction {
	const codeAction = new vscode.CodeAction(
		"Export these variables",
		vscode.CodeActionKind.RefactorRewrite,
	);
	const editor = vscode.window.activeTextEditor;
	const REGEX = /^\s*(?:@.*?)+(.*)$/gm
	const selectedText = document.getText(editor.selection);

	if (selectedText == "") return undefined;

	const individualLines = selectedText.split("\n");

	var updatedText: String[] = [];

	for (let i = 0; i < individualLines.length; i++) {
		const element = individualLines[i];
		console.log(element);

		if (!element.startsWith("var ")) {
			updatedText = updatedText.concat(element);
			continue;
		}
		updatedText = updatedText.concat(element.replace(/^var/, "@export var"));
	}
	console.log(updatedText);

	if (updatedText.length <= 0) return undefined;

	var newText: string = updatedText.join("\n");
	codeAction.edit = new vscode.WorkspaceEdit();
	codeAction.edit.replace(
		document.uri,
		editor.selection,
		newText,
	)
	return codeAction
}


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
		// Get the line where the cursor is located
		const startLine = document.lineAt(range.start.line);
		const lineText = startLine.text.trim();

		// Only show the action if the line starts with "var"
		if (!lineText.startsWith('var ')) {
			return undefined;
		}

		// Create the refactor action
		const addExportToVariable = new vscode.CodeAction(
			'Add @export to var',
			vscode.CodeActionKind.Refactor
		);

		// Specify the edits to be applied
		addExportToVariable.edit = new vscode.WorkspaceEdit();
		const updatedText = lineText.replace(/^var /, '@export var ${1:}');

		addExportToVariable.edit.replace(
			document.uri,
			startLine.range,
			updatedText
		);

		return [addExportToVariable];
	}
}

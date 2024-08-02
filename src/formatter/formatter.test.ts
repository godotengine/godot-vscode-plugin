import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

import { format_document, type FormatterOptions } from "./textmate";

import * as chai from "chai";
const expect = chai.expect;

const dots = ["..", "..", ".."];
const basePath = path.join(__filename, ...dots);

function get_options(testFolderPath: string) {
	const options: FormatterOptions = {
		maxEmptyLines: 2,
		denseFunctionParameters: false,
	};
	const optionsPath = path.join(testFolderPath, "config.json");
	if (fs.existsSync(optionsPath)) {
		const file = fs.readFileSync(optionsPath).toString();
		const config = JSON.parse(file);
		return { ...options, ...config } as FormatterOptions;
	}
	return options;
}

suite("GDScript Formatter Tests", () => {
	// Search for all folders in the snapshots folder and run a test for each
	// comparing the output of the formatter with the expected output.
	// To add a new test, create a new folder in the snapshots folder
	// and add two files, `in.gd` and `out.gd` for the input and expected output.
	const snapshotsFolderPath = path.join(basePath, "src/formatter/snapshots");
	const testFolders = fs.readdirSync(snapshotsFolderPath);

	// biome-ignore lint/complexity/noForEach: <explanation>
	testFolders.forEach((testFolder) => {
		const testFolderPath = path.join(snapshotsFolderPath, testFolder);
		if (fs.statSync(testFolderPath).isDirectory()) {
			test(`Snapshot Test: ${testFolder}`, async () => {
				const uriIn = vscode.Uri.file(path.join(testFolderPath, "in.gd"));
				const uriOut = vscode.Uri.file(path.join(testFolderPath, "out.gd"));

				const documentIn = await vscode.workspace.openTextDocument(uriIn);
				const documentOut = await vscode.workspace.openTextDocument(uriOut);

				const options = get_options(testFolderPath);
				const edits = format_document(documentIn, options);

				// Apply the formatting edits
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.set(uriIn, edits);
				await vscode.workspace.applyEdit(workspaceEdit);

				// Compare the result with the expected output
				expect(documentIn.getText().replace("\r\n", "\n")).to.equal(
					documentOut.getText().replace("\r\n", "\n"),
				);
			});
		}
	});
});

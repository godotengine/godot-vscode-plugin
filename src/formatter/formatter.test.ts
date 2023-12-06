import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";

import { format_document } from "./textmate";

const dots = ["..", "..", ".."];
const basePath = path.join(__filename, ...dots);

suite("GDScript Formatter Tests", () => {
	test("Test Formatting", async () => {
		const uri = vscode.Uri.file(path.join(basePath, "src/formatter/tests/test1.in.gd"));
		const document = await vscode.workspace.openTextDocument(uri);
		const edits = format_document(document);
		assert.strictEqual(4, edits.length);
	});
});

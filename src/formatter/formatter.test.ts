import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

import { format_document, type FormatterOptions } from "./textmate";

import * as chai from "chai";
const expect = chai.expect;

const dots = ["..", "..", ".."];
const basePath = path.join(__filename, ...dots);

const defaultOptions: FormatterOptions = {
	maxEmptyLines: 2,
	denseFunctionParameters: false,
};

function get_options(folder: fs.Dirent) {
	const optionsPath = path.join(folder.path, folder.name, "config.json");
	if (fs.existsSync(optionsPath)) {
		const file = fs.readFileSync(optionsPath).toString();
		const config = JSON.parse(file);
		return { ...defaultOptions, ...config } as FormatterOptions;
	}
	return defaultOptions;
}

suite("GDScript Formatter Tests", () => {
	// Search for all folders in the snapshots folder and run a test for each
	// comparing the output of the formatter with the expected output.
	// To add a new test, create a new folder in the snapshots folder
	// and add two files, `in.gd` and `out.gd` for the input and expected output.
	const snapshotsFolderPath = path.join(basePath, "src/formatter/snapshots");
	const testFolders = fs.readdirSync(snapshotsFolderPath, { withFileTypes: true, recursive: true });

	for (const folder of testFolders.filter((f) => f.isDirectory())) {
		test(`Snapshot Pair Test: ${folder.name}`, async () => {
			const uriIn = vscode.Uri.file(path.join(folder.path, folder.name, "in.gd"));
			const uriOut = vscode.Uri.file(path.join(folder.path, folder.name, "out.gd"));

			const documentIn = await vscode.workspace.openTextDocument(uriIn);
			const documentOut = await vscode.workspace.openTextDocument(uriOut);

			const options = get_options(folder);
			const edits = format_document(documentIn, options);

			// Apply the formatting edits
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.set(uriIn, edits);
			await vscode.workspace.applyEdit(workspaceEdit);

			// Compare the result with the expected output
			expect(documentIn.getText().replace("\r\n", "\n")).to.equal(documentOut.getText().replace("\r\n", "\n"));
		});
	}
});

function setContent(content: string) {
	return vscode.workspace
		.openTextDocument()
		.then((doc) => vscode.window.showTextDocument(doc))
		.then((editor) => {
			const editBuilder = (textEdit) => {
				textEdit.insert(new vscode.Position(0, 0), String(content));
			};

			return editor
				.edit(editBuilder, {
					undoStopBefore: true,
					undoStopAfter: false,
				})
				.then(() => editor);
		});
}

function build_config(lines: string[]) {
	try {
		return JSON.parse(lines.join("\n"));
	} catch (e) {}

	return {};
}

class TestLines {
	config: string[] = [];
	in: string[] = [];
	out: string[] = [];

	parse(_config) {
		const config = { ...defaultOptions, ..._config, ...build_config(this.config) };

		const test: Test = {
			in: this.in.join("\n"),
			out: this.out.join("\n"),
			config: config,
		};

		if (!config.strictTrailingNewlines) {
			test.in = test.in.trimEnd();
			test.out = test.out.trimEnd();
		}
		return test;
	}
}

interface Test {
	config?: FormatterOptions;
	in: string;
	out: string;
}

const CONFIG_ALL = "# --- CONFIG ALL ---";
const CONFIG = "# --- CONFIG ---";
const IN = "# --- IN ---";
const OUT = "# --- OUT ---";
const END = "# --- END ---";

const MODES = [CONFIG_ALL, CONFIG, IN, OUT, END];

function parse_test_file(content: string): Test[] {
	let defaultConfig = null;
	let defaultConfigString: string[] = [];

	const tests: Test[] = [];
	let mode = null;
	let test = new TestLines();

	for (const _line of content.split("\n")) {
		const line = _line.trim();

		if (MODES.includes(line)) {
			if (test.out.length !== 0) {
				tests.push(test.parse(defaultConfig));
				test = new TestLines();
			}

			if (defaultConfigString.length !== 0) {
				defaultConfig = build_config(defaultConfigString);
				defaultConfigString = [];
			}
			mode = line;
			continue;
		}

		if (mode === CONFIG_ALL) defaultConfigString.push(line);
		if (mode === CONFIG) test.config.push(line);
		if (mode === IN) test.in.push(line);
		if (mode === OUT) test.out.push(line);
	}

	if (test.out.length !== 0) {
		tests.push(test.parse(defaultConfig));
	}

	return tests;
}

suite("GDScript Single File Formatter Tests", () => {
	const snapshotsFolderPath = path.join(basePath, "src/formatter/snapshots");
	const testFiles = fs.readdirSync(snapshotsFolderPath, { withFileTypes: true });

	for (const file of testFiles.filter((f) => f.isFile())) {
		test(`Snapshot Test: ${file.name}`, async () => {
			const uri = vscode.Uri.file(path.join(snapshotsFolderPath, file.name));
			const inDoc = await vscode.workspace.openTextDocument(uri);
			const text = inDoc.getText();

			const tests = parse_test_file(text);

			for (const test of tests) {
				const editor = await setContent(test.in);
				const document = editor.document;

				const edits = format_document(document, test.config);

				// Apply the formatting edits
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.set(document.uri, edits);
				await vscode.workspace.applyEdit(workspaceEdit);

				const actual = document.getText().replace("\r\n", "\n");
				const expected = test.out.replace("\r\n", "\n");
				expect(actual).to.equal(expected);
			}
		});
	}
});

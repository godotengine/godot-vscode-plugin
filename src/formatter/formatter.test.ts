import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import { format_document, type FormatterOptions } from "./textmate";

import { expect } from "chai";

const dots = ["..", "..", ".."];
const basePath = path.join(__filename, ...dots);
const snapshotsFolderPath = path.join(basePath, "src/formatter/snapshots");

function normalizeLineEndings(str: string) {
	return str.replace(/\r?\n/g, "\n");
}

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

function set_content(content: string) {
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
	} catch (e) {
		return {};
	}
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

		if (test.out === "") {
			test.out = this.in.join("\n");
		}

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
			if (line === CONFIG || line === IN) {
				if (test.in.length !== 0) {
					tests.push(test.parse(defaultConfig));
					test = new TestLines();
				}
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

	if (test.in.length !== 0) {
		tests.push(test.parse(defaultConfig));
	}

	return tests;
}

suite("GDScript Formatter Tests", () => {
	const testFiles = fs.readdirSync(snapshotsFolderPath, { withFileTypes: true, recursive: true });

	for (const file of testFiles.filter((f) => f.isFile())) {
		if (["in.gd", "out.gd"].includes(file.name) || !file.name.endsWith(".gd")) {
			continue;
		}
		test(`Snapshot Test: ${file.name}`, async () => {
			const uri = vscode.Uri.file(path.join(snapshotsFolderPath, file.name));
			const inDoc = await vscode.workspace.openTextDocument(uri);
			const text = inDoc.getText();

			for (const test of parse_test_file(text)) {
				const editor = await set_content(test.in);
				const document = editor.document;

				const edits = format_document(document, test.config);

				// Apply the formatting edits
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.set(document.uri, edits);
				await vscode.workspace.applyEdit(workspaceEdit);

				const actual = normalizeLineEndings(document.getText());
				const expected = normalizeLineEndings(test.out);
				expect(actual).to.equal(expected);
			}
		});
	}

	for (const folder of testFiles.filter((f) => f.isDirectory())) {
		const pathIn = path.join(folder.path, folder.name, "in.gd");
		const pathOut = path.join(folder.path, folder.name, "out.gd");
		if (!(fs.existsSync(pathIn) && fs.existsSync(pathOut))) {
			continue;
		}
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
			const actual = normalizeLineEndings(documentIn.getText());
			const expected = normalizeLineEndings(documentOut.getText());
			expect(actual).to.equal(expected);
		});
	}
});

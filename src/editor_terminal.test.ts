import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { expect } from "chai";

const TERMINAL_NAME = "Godot Editor";

function waitFor<T>(getValue: () => T | undefined, timeout = 5000): Promise<T> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const interval = setInterval(() => {
			const value = getValue();
			if (value !== undefined) {
				clearInterval(interval);
				resolve(value);
			} else if (Date.now() - started >= timeout) {
				clearInterval(interval);
				reject(new Error("Timed out waiting for Godot Editor terminal state"));
			}
		}, 25);
	});
}

function createFakeGodot(directory: string, launchLog: string): string {
	if (process.platform === "win32") {
		const executable = path.join(directory, "fake-godot.cmd");
		fs.writeFileSync(
			executable,
			[
				"@echo off",
				'if "%~1"=="--version" (',
				"  echo 4.5.1.stable",
				"  exit /b 0",
				")",
				`echo launch>>"${launchLog}"`,
			].join("\r\n"),
		);
		return executable;
	}

	const executable = path.join(directory, "fake-godot");
	fs.writeFileSync(
		executable,
		[
			"#!/bin/sh",
			'if [ "$1" = "--version" ]; then',
			"  printf '4.5.1.stable\\n'",
			"  exit 0",
			"fi",
			`printf 'launch\\n' >> '${launchLog}'`,
		].join("\n"),
	);
	fs.chmodSync(executable, 0o755);
	return executable;
}

suite("Godot Editor terminal", () => {
	const configuration = vscode.workspace.getConfiguration("godotTools");
	const workspaceDirectory = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	let tempDirectory: string;
	let settingsFile: string;
	let originalSettings: Buffer | undefined;

	setup(async () => {
		if (!workspaceDirectory) {
			throw new Error("Test workspace is unavailable");
		}
		settingsFile = path.join(workspaceDirectory, ".vscode", "settings.json");
		originalSettings = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : undefined;
		tempDirectory = fs.mkdtempSync(path.join(workspaceDirectory, ".godot-terminal-test-"));
		await configuration.update(
			"editorPath.godot4",
			createFakeGodot(tempDirectory, path.join(tempDirectory, "launches.log")),
			vscode.ConfigurationTarget.Workspace,
		);
		await configuration.update("editor.reuseTerminal", true, vscode.ConfigurationTarget.Workspace);
		await configuration.update("editor.revealTerminal", false, vscode.ConfigurationTarget.Workspace);
	});

	teardown(async () => {
		for (const terminal of vscode.window.terminals.filter((terminal) => terminal.name === TERMINAL_NAME)) {
			terminal.dispose();
		}
		await configuration.update("editorPath.godot4", undefined, vscode.ConfigurationTarget.Workspace);
		await configuration.update("editor.reuseTerminal", undefined, vscode.ConfigurationTarget.Workspace);
		await configuration.update("editor.revealTerminal", undefined, vscode.ConfigurationTarget.Workspace);
		if (originalSettings) {
			fs.writeFileSync(settingsFile, originalSettings);
		} else {
			fs.rmSync(settingsFile, { force: true });
		}
		fs.rmSync(tempDirectory, { recursive: true, force: true });
	});

	test("reuses a terminal after it is moved into the editor area", async function () {
		this.timeout(10_000);
		const launchLog = path.join(tempDirectory, "launches.log");
		const findTerminal = () => vscode.window.terminals.find((terminal) => terminal.name === TERMINAL_NAME);
		const findTab = () =>
			vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.find((tab) => tab.input instanceof vscode.TabInputTerminal && tab.label === TERMINAL_NAME);

		await vscode.commands.executeCommand("godotTools.openEditor");
		const terminal = await waitFor(findTerminal);
		await waitFor(() => (fs.existsSync(launchLog) ? true : undefined));
		terminal.show();
		await vscode.commands.executeCommand("workbench.action.terminal.moveToEditor");
		const tab = await waitFor(findTab);

		await vscode.commands.executeCommand("godotTools.openEditor");
		await waitFor(() => (fs.readFileSync(launchLog, "utf8").trim().split("\n").length === 2 ? true : undefined));

		expect(findTerminal()).to.equal(terminal);
		expect(findTab()).to.equal(tab);
		expect(findTab()?.group).to.equal(tab.group);
	});
});

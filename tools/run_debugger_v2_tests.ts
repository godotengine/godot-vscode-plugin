import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	const root = path.resolve(__dirname, "..");
	if (!process.env.GODOT3_V2_PATH) throw new Error("Set GODOT3_V2_PATH to a Godot 3.6 debug-protocol-v2 executable");
	await runTests({
		vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
		extensionDevelopmentPath: root,
		extensionTestsPath: path.join(root, "out", "test", "debugger_v2_suite.js"),
		launchArgs: [path.join(root, "test_projects", "test-dap-project-godot3-v2"), "--disable-extensions"],
	});
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

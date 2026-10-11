import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	const root = path.resolve(__dirname, "..");
	const project = path.join(root, "test_projects", "test-dap-project-godot4-v2");
	if (!process.env.GODOT4_V2_PATH) throw new Error("Set GODOT4_V2_PATH to a Godot 4.6 debug-protocol-v2 executable");
	await runTests({
		vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
		extensionDevelopmentPath: root,
		extensionTestsPath: path.join(root, "out", "test", "godot4_v2_suite.js"),
		launchArgs: [project, "--disable-extensions"],
	});
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

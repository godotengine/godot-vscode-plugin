import * as fs from "node:fs";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	const root = path.resolve(__dirname, "..");
	const project = path.join(root, "test_projects", "test-dap-project-godot4");
	const godot = process.env.GODOT4_TEST_PATH;
	if (!godot) throw new Error("Set GODOT4_TEST_PATH to a stock Godot 4 executable");
	const settings = path.join(project, ".vscode", "settings.json");
	fs.mkdirSync(path.dirname(settings), { recursive: true });
	fs.writeFileSync(settings, `${JSON.stringify({ "godotTools.editorPath.godot4": godot }, null, 2)}\n`, "utf8");
	await runTests({
		vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
		extensionDevelopmentPath: root,
		extensionTestsPath: path.join(root, "out", "test", "godot4_debugger_suite.js"),
		launchArgs: [project, "--disable-extensions"],
	});
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

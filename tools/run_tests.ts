#!/usr/bin/env ts-node
/**
 * Test runner for engine-in-the-loop tests.
 *
 * Usage:
 *   ts-node tools/run_tests.ts <version> [grep pattern] [--godot3]
 *
 * Example:
 *   ts-node tools/run_tests.ts 4.7                          # All tests against Godot 4.7
 *   ts-node tools/run_tests.ts 4.7 "typed dict"             # Only matching tests
 *   ts-node tools/run_tests.ts 3.6.2 --godot3               # Test against Godot 3.6.2
 *
 * Resolves the Godot binary through fgvm's `which` command, which honors
 * FGVM_HOME as fgvm's root (or ~/fgvm when FGVM_HOME is unset),
 * writes a .vscode/settings.json into the test project with the
 * correct editorPath, then runs the existing vscode-test setup.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve_godot_binary } from "./resolve_godot";

const execFileAsync = promisify(execFile);

const TEST_PROJECT_GODOT4 = path.resolve("test_projects/test-dap-project-godot4");

function parse_args(): { version: string; isGodot3: boolean; grep?: string } {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.error("Usage: ts-node tools/run_tests.ts <version> [grep pattern] [--godot3]");
		console.error("Example: ts-node tools/run_tests.ts 4.7");
		console.error('         ts-node tools/run_tests.ts 4.7 "typed dict"');
		console.error("         ts-node tools/run_tests.ts 3.6.2 --godot3");
		process.exit(1);
	}

	const version = args[0];
	const isGodot3 = args.includes("--godot3");
	// Second positional arg (if not a flag) is the grep pattern
	const grep = args.slice(1).find((a) => !a.startsWith("--"));

	return { version, isGodot3, grep };
}

function write_test_settings(projectDir: string, settingKey: string, binaryPath: string): void {
	const vscodeDir = path.join(projectDir, ".vscode");
	const settingsPath = path.join(vscodeDir, "settings.json");

	if (!fs.existsSync(vscodeDir)) {
		fs.mkdirSync(vscodeDir, { recursive: true });
	}

	const settings = {
		[settingKey]: binaryPath,
	};

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + "\n");
	console.log(`Wrote ${settingsPath}`);
	console.log(`  ${settingKey} = ${binaryPath}`);
}

async function main() {
	const { version, isGodot3, grep } = parse_args();

	// 1. Resolve the binary path
	const binaryPath = resolve_godot_binary(version);
	console.log(`Resolved Godot ${version}: ${binaryPath}`);

	// 2. Verify the binary works
	try {
		const { stdout } = await execFileAsync(binaryPath, ["--version"]);
		console.log(`Binary version: ${stdout.trim()}`);
	} catch (err) {
		console.error(`Failed to execute Godot binary: ${err}`);
		process.exit(1);
	}

	// 3. Write settings into the test project so the extension finds the right Godot
	const settingKey = isGodot3 ? "godotTools.editorPath.godot3" : "godotTools.editorPath.godot4";
	write_test_settings(TEST_PROJECT_GODOT4, settingKey, binaryPath);

	// 4. Compile the extension
	console.log("Compiling extension...");
	const { stderr: compileErr } = await execFileAsync("npm", ["run", "compile"], {
		shell: true,
		cwd: path.resolve(__dirname, ".."),
	});
	if (compileErr) {
		console.error("Compilation errors:", compileErr);
	}
	console.log("Compilation complete.");

	// 5. Run the existing test setup (shells out to vscode-test via npm test)
	console.log("Running tests...");
	const testEnv = { ...process.env };
	// Enable debug server in tests unless explicitly disabled (e.g., CI)
	if (process.env.GODOT_TOOLS_DEBUG !== "false") {
		testEnv.VSCODE_DEBUG_MODE = "true";
	}

	const testArgs = ["test"];
	if (grep) {
		testArgs.push("--", "--grep", grep);
	}

	const testProcess = execFile("npm", testArgs, {
		shell: true,
		cwd: path.resolve(__dirname, ".."),
		env: testEnv,
	});

	testProcess.stdout?.pipe(process.stdout);
	testProcess.stderr?.pipe(process.stderr);

	testProcess.on("close", (code) => {
		if (code !== 0) {
			console.error(`Tests exited with code ${code}`);
			process.exit(code ?? 1);
		}
		console.log("Tests passed.");
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

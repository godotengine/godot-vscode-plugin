import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Resolves the path to a fgvm-managed Godot executable for a given version.
 *
 * fgvm stores installations under:
 *   <fgvm-home>/installations/<version-name>/<platform-dir>/<executable>
 *
 * <fgvm-home> is $FGVM_HOME/fgvm if FGVM_HOME is set (fgvm creates a "fgvm"
 * subdirectory inside the specified path), or ~/fgvm by default.
 *
 * Example on Windows:
 *   ~/fgvm/installations/4.7-stable-standard/win64.exe/Godot_v4.7-stable_win64.exe
 *
 * The version query ("4.7", "3.6.2") is matched against the installation dir name
 * with a "-stable-" suffix to avoid matching pre-release builds.
 */

function get_fgvm_home(): string {
	const env = process.env.FGVM_HOME;
	return env? env : path.join(os.homedir(), "fgvm");
}

/**
 * The platform-specific subdirectory and executable regex pattern.
 * fgvm uses different directory names and executable patterns per OS.
 */
function get_platform_pattern(): { dir: string; pattern: RegExp } {
	const platform = process.platform;
	const arch = process.arch;

	if (platform === "win32" && arch === "x64") {
		return { dir: "win64.exe", pattern: /^Godot_v.*_win64\.exe$/ };
	}
	if (platform === "darwin" && arch === "arm64") {
		return { dir: "osx.arm64", pattern: /^Godot_v.*osx\.universal$/ };
	}
	if (platform === "darwin" && arch === "x64") {
		return { dir: "osx.x86_64", pattern: /^Godot_v.*osx\.universal$/ };
	}
	if (platform === "linux" && arch === "x64") {
		return { dir: "linux.x86_64", pattern: /^Godot_v.*_linux\.x86_64$/ };
	}
	if (platform === "linux" && arch === "arm64") {
		return { dir: "linux.arm64", pattern: /^Godot_v.*_linux\.arm64$/ };
	}

	throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Find a fgvm-managed Godot executable by version.
 *
 * @param version Version query, e.g. "4.7", "3.6.2"
 * @returns Absolute path to the Godot executable
 * @throws If no matching installation is found
 */
export function resolve_godot_binary(version: string): string {
	const home = get_fgvm_home();
	const installationsDir = path.join(home, "installations");

	if (!fs.existsSync(installationsDir)) {
		throw new Error(`fgvm installations directory not found: ${installationsDir}`);
	}

	// Match version against installation dir names.
	// fgvm names: "4.7-stable-standard", "3.6.2-stable-standard", etc.
	// We match "<version>-stable-*" to avoid pre-release builds.
	const versionPattern = new RegExp(
		`^${version.replaceAll(".", "\\.")}(?:\\.\\d+)*-stable-*`,
	);

	const candidates = fs
		.readdirSync(installationsDir)
		.filter((name) => versionPattern.test(name));

	if (candidates.length === 0) {
		throw new Error(
			`No fgvm installation found for version "${version}". ` +
				`Run: fgvm install ${version}`,
		);
	}

	if (candidates.length > 1) {
		throw new Error(
			`Multiple installations found for version "${version}": ${candidates.join(", ")}`,
		);
	}

	const installDir = path.join(installationsDir, candidates[0]);
	const { dir: platformDir, pattern } = get_platform_pattern();
	const platformPath = path.join(installDir, platformDir);

	if (!fs.existsSync(platformPath)) {
		throw new Error(`Platform directory not found: ${platformPath}`);
	}

	// Find the Godot executable (exclude console/debug variants on Windows)
	const executables = fs
		.readdirSync(platformPath)
		.filter((f) => pattern.test(f))
		.filter((f) => !f.includes("_console."));

	if (executables.length === 0) {
		throw new Error(`No Godot executable found in ${platformPath}`);
	}

	return path.join(platformPath, executables[0]);
}
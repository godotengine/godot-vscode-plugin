import { execFileSync } from "node:child_process";

/**
 * Resolves the path to a fgvm-managed Godot executable for a given version.
 *
 * @param version Version query, e.g. "4.7", "3.6.2"
 * @returns Absolute path to the Godot executable
 * @throws If fgvm cannot resolve the requested version
 */
export function resolve_godot_binary(version: string): string {
	const binaryPath = execFileSync("fgvm", ["which", version], {
		encoding: "utf8",
		env: process.env,
	}).trim();

	if (!binaryPath) {
		throw new Error(`fgvm returned no executable path for version "${version}"`);
	}

	return binaryPath;
}

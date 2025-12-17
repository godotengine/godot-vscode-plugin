import { AddressInfo, createServer } from "net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export * from "./logger";
export * from "./godot_utils";
export * from "./settings_updater";
export * from "./vscode_utils";

export function is_debug_mode(): boolean {
	return process.env.VSCODE_DEBUG_MODE === "true";
}

export async function find_file(file: string): Promise<vscode.Uri | null> {
	if (fs.existsSync(file)) {
		return vscode.Uri.file(file);
	}
	const fileName = path.basename(file);
	const results = await vscode.workspace.findFiles(`**/${fileName}`, null);
	if (results.length === 1) {
		return results[0];
	}

	return null;
}

export async function get_free_port(): Promise<number> {
	return new Promise((res) => {
		const srv = createServer();
		srv.listen(0, () => {
			const port = (srv.address() as AddressInfo).port;
			srv.close((err) => res(port));
		});
	});
}

export function make_docs_uri(path: string, fragment?: string) {
	return vscode.Uri.from({
		scheme: "gddoc",
		path: `${path}.gddoc`,
		fragment: fragment,
	});
}

/**
 * Can be used to convert a conventional node name to a snake_case variable name.
 *
 * @example
 * ```ts
 * nodeNameToVar("MyNode") // my_node
 * nodeNameToVar("Sprite2D") // sprite_2d
 * nodeNameToVar("UI") // ui
 * ```
 */
export function node_name_to_snake(name: string): string {
	const snakeCase: string = name.replace(/([a-z])([A-Z0-9])/g, "$1_$2").toLowerCase();

	if (snakeCase.startsWith("_")) {
		return snakeCase.substring(1);
	}
	return snakeCase;
}

/**
 * Converts a node name to PascalCase for C# property names.
 *
 * @example
 * ```ts
 * node_name_to_pascal("my_button") // "MyButton"
 * node_name_to_pascal("Sprite2D") // "Sprite2D"
 * node_name_to_pascal("player_health_bar") // "PlayerHealthBar"
 * ```
 */
export function node_name_to_pascal(name: string): string {
	// Handle already PascalCase names (common in Godot)
	if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && !name.includes("_")) {
		return name;
	}

	// Convert snake_case or mixed case to PascalCase
	return name
		.split(/[_\s-]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join("")
		// Handle numbers followed by lowercase (e.g., "2d" -> "2D")
		.replace(/(\d)([a-z])/g, (_, num, letter) => num + letter.toUpperCase());
}

/**
 * Converts a node name to camelCase for C# field names.
 *
 * @example
 * ```ts
 * node_name_to_camel("my_button") // "myButton"
 * node_name_to_camel("MyNode") // "myNode"
 * node_name_to_camel("Sprite2D") // "sprite2D"
 * ```
 */
export function node_name_to_camel(name: string): string {
	const pascal = node_name_to_pascal(name);
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export const ansi = {
	reset: "\u001b[0;37m",
	red: "\u001b[0;31m",
	green: "\u001b[0;32m",
	yellow: "\u001b[0;33m",
	blue: "\u001b[0;34m",
	purple: "\u001b[0;35m",
	cyan: "\u001b[0;36m",
	white: "\u001b[0;37m",
	bright: {
		red: "\u001b[1;31m",
		green: "\u001b[1;32m",
		yellow: "\u001b[1;33m",
		blue: "\u001b[1;34m",
		purple: "\u001b[1;35m",
		cyan: "\u001b[1;36m",
		white: "\u001b[1;37m",
	},
	dim: {
		red: "\u001b[1;2;31m",
		green: "\u001b[1;2;32m",
		yellow: "\u001b[1;2;33m",
		blue: "\u001b[1;2;34m",
		purple: "\u001b[1;2;35m",
		cyan: "\u001b[1;2;36m",
		white: "\u001b[1;2;37m",
	},
} as const;

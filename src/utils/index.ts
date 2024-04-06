import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AddressInfo, createServer } from "net";

export * from "./logger";
export * from "./project_utils";
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
	return new Promise(res => {
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

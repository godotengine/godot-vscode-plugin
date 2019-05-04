import { workspace } from "vscode";
import * as websocket from "websocket-stream";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { is_debug_mode, get_configuration } from "../utils";
import logger from "../loggger";

function getClientOptions(): LanguageClientOptions {
	return {
		// Register the server for plain text documents
		documentSelector: [
			{ scheme: "file", language: "gdscript" },
			{ scheme: "untitled", language: "gdscript" },
		],
		synchronize: {
			// Notify the server about file changes to '.gd files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher("**/*.gd"),
		},
	};
}

const serverOptions: ServerOptions = () => {
	return new Promise((resolve, reject) => {
		let port = get_configuration("gdscript_lsp_server_port", 6008);
		const ws = websocket(`ws://localhost:${port}`);
		if (is_debug_mode()) {
			let text = '';
			ws.on('data', (chunk)=>{
				let message = chunk.toString();
				text += message;
				logger.log("[server]", message);
			});
			const origin_write = ws._write.bind(ws);
			ws._write = (function (chunk: any, encoding: string, callback: (error?: Error | null) => void) {
				let message = chunk.toString();
				text += message;
				origin_write(chunk, encoding, callback);
				logger.log("[client]", message);
			}).bind(ws);
		}
		resolve({reader: ws, writer: ws});
	});
};

export default class GDScriptLanguageClient extends LanguageClient {
	constructor() {
		super(`GDScriptLanguageClient`, serverOptions, getClientOptions());
	}
};

import { workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { is_debug_mode, get_configuration } from "../utils";
import logger from "../loggger";
import * as WebSocket  from 'ws';
import * as vscode  from 'vscode';
import { EventEmitter } from "events";
import { MessageIO, MessageIOReader, MessageIOWriter } from "./MessageIO";

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

function get_server_uri() : string {
	let port = get_configuration("gdscript_lsp_server_port", 6008);
	return `ws://localhost:${port}`;
}

const io = new MessageIO(get_server_uri());
const serverOptions: ServerOptions = () => {
	return new Promise((resolve, reject) => {
		io.connect_to_language_server().then(()=>{
			resolve({reader: new MessageIOReader(io), writer: new MessageIOWriter(io)});
		});
	});
};

export default class GDScriptLanguageClient extends LanguageClient {	
	constructor() {
		super(`GDScriptLanguageClient`, serverOptions, getClientOptions());
		io.on('disconnected', this.on_disconnected.bind(this));
	}
	
	private on_disconnected() {
		vscode.window.showErrorMessage(`Failed connect to GDScript Language Server`, 'Retry', 'Close').then(item=>{
			if (item == 'Retry') {
				io.connect_to_language_server();
			}
		});
	}
};

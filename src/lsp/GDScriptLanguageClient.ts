import { workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { is_debug_mode, get_configuration } from "../utils";
import logger from "../loggger";
import {DuplexMock} from 'stream-mock';
import * as WebSocket  from 'ws';
import * as vscode  from 'vscode';

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

class MessageIO {
	stream: DuplexMock = null;
	socket: WebSocket = null; 
	
	public get server_uri() : string {
		let port = get_configuration("gdscript_lsp_server_port", 6008);
		return `ws://localhost:${port}`;
	}
	
	constructor() {
		this.stream = new DuplexMock();
		const origin_write = this.stream._write.bind(this.stream);
		this.stream._write =  (chunk: any, encoding: string, callback: (error?: Error | null) => void) => {
			this.send_message(chunk);
			origin_write(chunk, encoding, callback);
		};
	}
	
	protected send_message(chunk: Buffer) {
		let message = chunk.toString();
		if (this.socket) {
			this.socket.send(message);
			this.stream.pause();
		}
		logger.log("[client]", message);
	}
	
	protected on_recive_message(chunk: WebSocket.Data) {
		let message = chunk.toString();
		this.stream.emit('data',message);
		this.stream.resume();
		logger.log("[server]", message);
	}
	
	connect_to_language_server():Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = null;
			const ws = new WebSocket(this.server_uri);
			ws.on('open', ()=>{ this.on_connected(ws); resolve(); });
			ws.on('message', this.on_recive_message.bind(this));
			ws.on('error', this.on_disconnected.bind(this));
			ws.on('close', this.on_disconnected.bind(this));
		});
	}
	
	private on_connected(socket: WebSocket) {
		this.socket = socket;
	}
	
	private on_disconnected() {
		this.socket = null;
		vscode.window.showErrorMessage(`Failed connect to GDScript Language Server`, 'Retry', 'Close').then(item=>{
			if (item == 'Retry') {
				this.connect_to_language_server();
			}
		});
	}
};


const io = new MessageIO();
const serverOptions: ServerOptions = () => {
	return new Promise((resolve, reject) => {
		io.connect_to_language_server().then(()=>{
			resolve({reader: io.stream, writer: io.stream});
		});
	});
};
export default class GDScriptLanguageClient extends LanguageClient {	
	constructor() {
		super(`GDScriptLanguageClient`, serverOptions, getClientOptions());
	}
};

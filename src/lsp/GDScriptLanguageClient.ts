import { workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { is_debug_mode, get_configuration } from "../utils";
import * as vscode  from 'vscode';
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
			// fileEvents: workspace.createFileSystemWatcher("**/*.gd"),
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
		resolve({reader: new MessageIOReader(io), writer: new MessageIOWriter(io)});
	});
};

export enum ClientStatus {
	PENDING,
	DISCONNECTED,
	CONNECTED,
}
export default class GDScriptLanguageClient extends LanguageClient {
	
	public io: MessageIO = io;
	
	private _status : ClientStatus;
	private _status_changed_callbacks: ((v : ClientStatus)=>void)[] = [];
	
	public get status() : ClientStatus { return this._status; }
	public set status(v : ClientStatus) {
		if (this._status != v) {
			this._status = v;
			for (const callback of this._status_changed_callbacks) {
				callback(v);
			}
		}
	}
	
	public watch_status(callback: (v : ClientStatus)=>void) {
		if (this._status_changed_callbacks.indexOf(callback) == -1) {
			this._status_changed_callbacks.push(callback);
		}
	}
	
	constructor() {
		super(`GDScriptLanguageClient`, serverOptions, getClientOptions());
		this.status = ClientStatus.PENDING;
		this.io.on('disconnected', ()=> this.status = ClientStatus.DISCONNECTED);
		this.io.on('connected', ()=> this.status = ClientStatus.CONNECTED);
	}
	
	connect_to_server() {
		this.status = ClientStatus.PENDING;
		io.connect_to_language_server();
	}
};

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, RequestMessage } from "vscode-languageclient";
import { is_debug_mode, get_configuration } from "../utils";
import logger from "../loggger";
import { EventEmitter } from "events";
import NativeDocumentManager from './NativeDocumentManager';

const use_tcp = get_configuration("use_tcp", false);
const MessageIO = use_tcp ? require("./MessageIO_TCP").MessageIO : require("./MessageIO_WS").MessageIO
const MessageIOReader = use_tcp ? require("./MessageIO_TCP").MessageIOReader : require("./MessageIO_WS").MessageIOReader
const MessageIOWriter = use_tcp ? require("./MessageIO_TCP").MessageIOWriter : require("./MessageIO_WS").MessageIOWriter
const Message = use_tcp ? require("./MessageIO_TCP").Message : require("./MessageIO_WS").Message

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

function get_server_port() : number {
	return get_configuration("gdscript_lsp_server_port", 6008);
}

function get_server_uri_ws() : string {
	let port = get_configuration("gdscript_lsp_server_port")
	return  `ws://localhost:${port}`
}

let io = null;
if (get_configuration("use_tcp", false)) {
	io = new MessageIO(get_server_port())
} else {
	io = new MessageIO(get_server_uri_ws())
}

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
const CUSTOM_MESSAGE = "gdscrip_client/";

export default class GDScriptLanguageClient extends LanguageClient {

	public io = io;

	private context: vscode.ExtensionContext;
	private _started : boolean = false;
	private _status : ClientStatus;
	private _status_changed_callbacks: ((v : ClientStatus)=>void)[] = [];
	private _initialize_request = null;
	private message_handler: MessageHandler = null;
	private native_doc_manager: NativeDocumentManager = null;

	public get started() : boolean { return this._started; }
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

	constructor(context: vscode.ExtensionContext) {
		super(`GDScriptLanguageClient`, serverOptions, getClientOptions());
		this.context = context;
		this.status = ClientStatus.PENDING;
		this.message_handler = new MessageHandler();
		this.io.on('disconnected', this.on_disconnected.bind(this));
		this.io.on('connected', this.on_connected.bind(this));
		this.io.on('message', this.on_message.bind(this));
		this.io.on('send_message', this.on_send_message.bind(this));
		this.native_doc_manager = new NativeDocumentManager(this.io);
	}

	connect_to_server() {
		this.status = ClientStatus.PENDING;
		io.connect_to_language_server(get_server_port());
	}

	start(): vscode.Disposable {
		this._started = true;
		return super.start();
	}

	private on_send_message(message) {
		if (is_debug_mode()) logger.log("[client]", JSON.stringify(message));
		if ((message as RequestMessage).method == "initialize") {
			this._initialize_request = message;
		}
	}

	private on_message(message) {
		if (is_debug_mode()) logger.log("[server]", JSON.stringify(message));
		this.message_handler.on_message(message);
	}

	private on_connected() {
		if (this._initialize_request) {
			this.io.writer.write(this._initialize_request);
		}
		this.status = ClientStatus.CONNECTED;
	}

	private on_disconnected() {
		this.status = ClientStatus.DISCONNECTED;
	}
};



class MessageHandler extends EventEmitter {

	changeWorkspace(params: {path: string}) {
		vscode.window.showErrorMessage("The GDScript language server can't work properly!\nThe open workspace is different from the editor's.", 'Reload', 'Ignore').then(item=>{
			if (item == "Reload") {
				let folderUrl = vscode.Uri.file(params.path);
				vscode.commands.executeCommand('vscode.openFolder', folderUrl, false);
			}
		});
	}

	on_message(message: any) {
		
		// FIXME: Hot fix VSCode 1.42 hover position
		if (message && message.result && message.result.range && message.result.contents) { 
			message.result.range = undefined;
		}
		
		if (message && message.method && (message.method as string).startsWith(CUSTOM_MESSAGE)) {
			const method = (message.method as string).substring(CUSTOM_MESSAGE.length, message.method.length);
			if (this[method]) {
				let ret = this[method](message.params);
				if (ret) {
					io.writer.write(ret);
				}
			}
		}
	}
}

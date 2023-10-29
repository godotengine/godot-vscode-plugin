import { EventEmitter } from "events";
import * as vscode from 'vscode';
import { LanguageClient, RequestMessage, ResponseMessage, integer } from "vscode-languageclient/node";
import { createLogger } from "../logger";
import { get_configuration, set_context } from "../utils";
import { Message, MessageIO, MessageIOReader, MessageIOWriter, TCPMessageIO, WebSocketMessageIO } from "./MessageIO";
import { NativeDocumentManager } from './NativeDocumentManager';

const log = createLogger("lsp.client");

export enum ClientStatus {
	PENDING,
	DISCONNECTED,
	CONNECTED,
}

export enum TargetLSP {
	HEADLESS,
	EDITOR,
}

const CUSTOM_MESSAGE = "gdscrip_client/";

export default class GDScriptLanguageClient extends LanguageClient {
	public readonly io: MessageIO = (get_configuration("lsp.serverProtocol") == "ws") ? new WebSocketMessageIO() : new TCPMessageIO();

	private context: vscode.ExtensionContext;
	private _started: boolean = false;
	private _status: ClientStatus;
	private _status_changed_callbacks: ((v: ClientStatus) => void)[] = [];
	private _initialize_request: Message = null;
	private message_handler: MessageHandler = null;
	private native_doc_manager: NativeDocumentManager = null;

	public target: TargetLSP = TargetLSP.EDITOR;

	public port: number = -1;
	public lastPortTried: number = -1;
	public sentMessages = new Map();
	public lastSymbolHovered: string = "";

	public get started(): boolean { return this._started; }
	public get status(): ClientStatus { return this._status; }
	public set status(v: ClientStatus) {
		if (this._status != v) {
			this._status = v;
			for (const callback of this._status_changed_callbacks) {
				callback(v);
			}
		}
	}

	public watch_status(callback: (v: ClientStatus) => void) {
		if (this._status_changed_callbacks.indexOf(callback) == -1) {
			this._status_changed_callbacks.push(callback);
		}
	}

	public open_documentation() {
		const symbol = this.lastSymbolHovered;
		this.native_doc_manager.request_documentation(symbol);
	}

	constructor(context: vscode.ExtensionContext) {
		super(
			`GDScriptLanguageClient`,
			() => {
				return new Promise((resolve, reject) => {
					resolve({ reader: new MessageIOReader(this.io), writer: new MessageIOWriter(this.io) });
				});
			},
			{
				// Register the server for plain text documents
				documentSelector: [
					{ scheme: "file", language: "gdscript" },
					{ scheme: "untitled", language: "gdscript" },
				],
				synchronize: {
					// Notify the server about file changes to '.gd files contain in the workspace
					// fileEvents: workspace.createFileSystemWatcher("**/*.gd"),
				},
			}
		);
		this.context = context;
		this.status = ClientStatus.PENDING;
		this.message_handler = new MessageHandler(this.io);
		this.io.on('disconnected', this.on_disconnected.bind(this));
		this.io.on('connected', this.on_connected.bind(this));
		this.io.on('message', this.on_message.bind(this));
		this.io.on('send_message', this.on_send_message.bind(this));
		this.native_doc_manager = new NativeDocumentManager(this.io);
	}

	connect_to_server(target: TargetLSP = TargetLSP.EDITOR) {
		this.target = target;
		this.status = ClientStatus.PENDING;

		let port = get_configuration("lsp.serverPort");
		if (this.port !== -1) {
			port = this.port;
		}

		if (this.target == TargetLSP.EDITOR) {
			if (port === 6005 || port === 6008) {
				port = 6005;
			}
		}

		this.lastPortTried = port;

		const host = get_configuration("lsp.serverHost");
		log.info(`attempting to connect to LSP at ${host}:${port}`);

		this.io.connect_to_language_server(host, port);
	}

	start() {
		this._started = true;
		return super.start();
	}

	private on_send_message(message: RequestMessage) {
		log.debug("tx:", message);

		this.sentMessages.set(message.id, message.method);

		if (message.method == "initialize") {
			this._initialize_request = message;
		}
	}

	private on_message(message: ResponseMessage) {
		const msgString = JSON.stringify(message);
		log.debug("rx:", message);

		// This is a dirty hack to fix the language server sending us
		// invalid file URIs
		// This should be forward-compatible, meaning that it will work
		// with the current broken version, AND the fixed future version.
		const match = msgString.match(/"target":"file:\/\/[^\/][^"]*"/);
		if (match) {
			const count = (message["result"] as Array<object>).length;
			for (let i = 0; i < count; i++) {
				const x: string = message["result"][i]["target"];
				message["result"][i]["target"] = x.replace('file://', 'file:///');
			}
		}

		const method = this.sentMessages.get(message.id);
		if (method === "textDocument/hover") {
			this.handle_hover_response(message);

			// this is a dirty hack to fix language server sending us prerendered
			// markdown but not correctly stripping leading #'s, leading to 
			// docstrings being displayed as titles
			const value: string = message.result["contents"].value;
			message.result["contents"].value = value.replace(/\n[#]+/g, '\n');
		}

		this.message_handler.on_message(message);
	}

	private handle_hover_response(message: ResponseMessage) {
		this.lastSymbolHovered = "";
		set_context("typeFound", false);

		let decl: string = message.result["contents"].value;
		decl = decl.split('\n')[0].trim();

		// strip off the value
		if (decl.includes("=")) {
			decl = decl.split("=")[0];
		}
		if (decl.includes(":")) {
			const parts = decl.split(":");
			if (parts.length === 2) {
				decl = parts[1].trim();

			}
		}
		if (decl.includes("<Native>")) {
			decl = decl.split(" ")[2];
		}

		if (decl.includes(" ")) {
			return;
		}

		this.lastSymbolHovered = decl;
		set_context("typeFound", true);
	}

	private on_connected() {
		if (this._initialize_request) {
			this.io.writer.write(this._initialize_request);
		}
		this.status = ClientStatus.CONNECTED;
	}

	private on_disconnected() {
		if (this.target == TargetLSP.EDITOR) {
			const host = get_configuration("lsp.serverHost");
			let port = get_configuration("lsp.serverPort");

			if (port === 6005 || port === 6008) {
				if (this.lastPortTried === 6005) {
					port = 6008;
					log.info(`attempting to connect to LSP at ${host}:${port}`);

					this.lastPortTried = port;
					this.io.connect_to_language_server(host, port);
					return;
				}
			}
		}
		this.status = ClientStatus.DISCONNECTED;
	}
}

class MessageHandler extends EventEmitter {
	private io: MessageIO = null;

	constructor(io: MessageIO) {
		super();
		this.io = io;
	}

	changeWorkspace(params: { path: string }) {
		vscode.window.showErrorMessage("The GDScript language server can't work properly!\nThe open workspace is different from the editor's.", 'Reload', 'Ignore').then(item => {
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
					this.io.writer.write(ret);
				}
			}
		}
	}
}

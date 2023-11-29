import { EventEmitter } from "events";
import * as vscode from 'vscode';
import { LanguageClient, RequestMessage, ResponseMessage, integer } from "vscode-languageclient/node";
import { createLogger, LOG_LEVEL } from "../logger";
import { get_configuration, set_context } from "../utils";
import { Message, MessageIO, MessageIOReader, MessageIOWriter, TCPMessageIO, WebSocketMessageIO } from "./MessageIO";
import { NativeDocumentManager } from './NativeDocumentManager';
import { NativeSymbolInspectParams } from "./gdscript.capabilities";

const log = createLogger("lsp.client", {level: LOG_LEVEL.SILENT});

export enum ClientStatus {
	PENDING,
	DISCONNECTED,
	CONNECTED,
}

export enum TargetLSP {
	HEADLESS,
	EDITOR,
}

export interface GDScriptDeclarationData extends NativeSymbolInspectParams {
	symbol_type?: string
	description?: string
}

const CUSTOM_MESSAGE = "gdscript_client/";

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
	public lastSymbolHovered: GDScriptDeclarationData

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
		this.native_doc_manager.request_documentation(this.lastSymbolHovered);
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
		if (method === "textDocument/definition") {
			this.handle_definition_response(message);
		} else if (method === "textDocument/hover") {
			this.handle_hover_response(message);
			// this is a dirty hack to fix language server sending us prerendered
			// markdown but not correctly stripping leading #'s, leading to 
			// docstrings being displayed as titles
			const value: string = message.result["contents"]?.value;
			message.result["contents"].value = value?.replace(/\n[#]+/g, '\n');
		}

		this.message_handler.on_message(message);
	}

	private handle_definition_response(message: ResponseMessage) {
		if ((message.result as any[])?.length > 0) {
			return
		}
		// No symbol found
		// Send fake textDocument/hover message to get symbol definition under the cursor
		// (there's probably a better way to do this)
		const activeEditor = vscode.window.activeTextEditor;
		const { line, character } = activeEditor.selection.active;
		const uri = vscode.window.activeTextEditor.document.uri.toString()
		const fakeHoverMessage = {
			jsonrpc: "2.0",
			id: -1,
			method: "textDocument/hover",
			params: {
				position: { line: line, character: character },
				textDocument: { uri: uri }
			}
		}
		this.io.writer.write(fakeHoverMessage);
	}

	private async handle_fake_hover_response(message: ResponseMessage) {
		const content: string[] | object = message?.result["contents"];

		let typeData = this.parse_declaration(content["value"]);
		if (!typeData && Array.isArray(content)) {
			typeData = await this.select_type_data(content);
		}

		if (!typeData || !typeData.native_class) {
			return
		}

		this.native_doc_manager.request_documentation(typeData);
	}

	private async select_type_data(decls: string[]): Promise<GDScriptDeclarationData> {
		const typeOptions = decls.map((decl) => this.parse_declaration(decl));
		const pickOptions = typeOptions.map((typeData, i) => {
			let label = typeData.native_class
			if (typeData.symbol_name) {
				label += `.${typeData.symbol_name}`
			}
			return {
				label: label,
				description: typeData.symbol_type,
				detail: typeData.description,
			};
		});
		const selected = await vscode.window.showQuickPick(
			pickOptions, { placeHolder: "Open Godot Documentation" }
		);
		if (!selected) {
			return;
		}
		return typeOptions[pickOptions.indexOf(selected)];
	}

	private handle_hover_response(message: ResponseMessage) {
		if (message.id === -1) {
			this.handle_fake_hover_response(message);
			return;
		}

		this.lastSymbolHovered = null;
		set_context("typeFound", false);

		let decl: string = message?.result["contents"]?.value;

		const typeData = this.parse_declaration(decl);
		if (!typeData || !typeData.native_class) {
			return
		}

		this.lastSymbolHovered = typeData;

		set_context("typeFound", true);
	}

	private parse_declaration(decl: string): GDScriptDeclarationData {
		if (!decl) {
			return;
		}
		const description = decl.split("\n")[2];
		decl = decl.split("\n")[0].trim();

		if (decl.includes("<Native>")) {
			return { native_class: decl.split(" ")[2], description };
		}

		const parts = decl.split(" ")
		const [native_class, symbol] = parts[1].split(".")
		return {
			native_class,
			description,
			symbol_name: symbol.split(":")[0].split("(")[0],
			symbol_type: parts[2],
		};
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

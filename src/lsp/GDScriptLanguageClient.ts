import * as vscode from "vscode";
import { LanguageClient, NotificationMessage, RequestMessage, ResponseMessage } from "vscode-languageclient/node";
import { EventEmitter } from "events";
import { get_configuration, createLogger } from "../utils";
import { Message, MessageIO, MessageIOReader, MessageIOWriter, TCPMessageIO, WebSocketMessageIO } from "./MessageIO";
import { globals } from "../extension";

const log = createLogger("lsp.client", { output: "Godot LSP" });

export enum ClientStatus {
	PENDING,
	DISCONNECTED,
	CONNECTED,
}

export enum TargetLSP {
	HEADLESS,
	EDITOR,
}

const CUSTOM_MESSAGE = "gdscript_client/";

export default class GDScriptLanguageClient extends LanguageClient {
	public readonly io: MessageIO = (get_configuration("lsp.serverProtocol") === "ws") ? new WebSocketMessageIO() : new TCPMessageIO();

	private _status_changed_callbacks: ((v: ClientStatus) => void)[] = [];
	private _initialize_request: Message = null;
	private messageHandler: MessageHandler = null;

	public target: TargetLSP = TargetLSP.EDITOR;

	public port = -1;
	public lastPortTried = -1;
	public sentMessages = new Map();
	public lastSymbolHovered = "";

	private _started = false;
	public get started(): boolean { return this._started; }

	private _status: ClientStatus;
	public get status(): ClientStatus { return this._status; }
	public set status(v: ClientStatus) {
		if (this._status !== v) {
			this._status = v;
			for (const callback of this._status_changed_callbacks) {
				callback(v);
			}
		}
	}

	public watch_status(callback: (v: ClientStatus) => void) {
		if (this._status_changed_callbacks.indexOf(callback) === -1) {
			this._status_changed_callbacks.push(callback);
		}
	}

	constructor(private context: vscode.ExtensionContext) {
		super(
			"GDScriptLanguageClient",
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
					fileEvents: vscode.workspace.createFileSystemWatcher("**/*.gd"),
				},
			}
		);
		this.status = ClientStatus.PENDING;
		this.io.on("disconnected", this.on_disconnected.bind(this));
		this.io.on("connected", this.on_connected.bind(this));
		this.io.on("message", this.on_message.bind(this));
		this.io.on("send_message", this.on_send_message.bind(this));
		this.messageHandler = new MessageHandler(this.io);
	}

	public async list_classes() {
		await globals.docsProvider.list_native_classes();
	}

	connect_to_server(target: TargetLSP = TargetLSP.EDITOR) {
		this.target = target;
		this.status = ClientStatus.PENDING;

		let port = get_configuration("lsp.serverPort");
		if (this.port !== -1) {
			port = this.port;
		}

		if (this.target === TargetLSP.EDITOR) {
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
		this.sentMessages.set(message.id, message);

		if (message.method === "initialize") {
			this._initialize_request = message;
		}
	}

	private on_message(message: ResponseMessage | NotificationMessage) {
		const msgString = JSON.stringify(message);

		// This is a dirty hack to fix the language server sending us
		// invalid file URIs
		// This should be forward-compatible, meaning that it will work
		// with the current broken version, AND the fixed future version.
		const match = msgString.match(/"target":"file:\/\/[^\/][^"]*"/);
		if (match) {
			const count = (message["result"] as Array<object>).length;
			for (let i = 0; i < count; i++) {
				const x: string = message["result"][i]["target"];
				message["result"][i]["target"] = x.replace("file://", "file:///");
			}
		}

		if ("method" in message && message.method === "gdscript/capabilities") {
			globals.docsProvider.register_capabilities(message);
		}

		if ("id" in message) {
			const sentMessage = this.sentMessages.get(message.id);
			if (sentMessage && sentMessage.method === "textDocument/hover") {
				// fix markdown contents
				let value: string = message.result["contents"]?.value;
				if (value) {
					// this is a dirty hack to fix language server sending us prerendered
					// markdown but not correctly stripping leading #'s, leading to 
					// docstrings being displayed as titles
					value = value.replace(/\n[#]+/g, "\n");

					// fix bbcode line breaks
					value = value.replaceAll("`br`", "\n\n");

					// fix bbcode code boxes
					value = value.replace("`codeblocks`", "");
					value = value.replace("`/codeblocks`", "");
					value = value.replace("`gdscript`", "\nGDScript:\n```gdscript");
					value = value.replace("`/gdscript`", "```");
					value = value.replace("`csharp`", "\nC#:\n```csharp");
					value = value.replace("`/csharp`", "```");

					message.result["contents"].value = value;
				}
			}
		}

		this.messageHandler.on_message(message);
	}

	public async get_symbol_at_position(uri: vscode.Uri, position: vscode.Position) {
		const params = {
			textDocument: { uri: uri.toString() },
			position: { line: position.line, character: position.character },
		};
		const response = await this.sendRequest("textDocument/hover", params);

		return this.parse_hover_response(response);
	}

	private parse_hover_response(message) {
		const contents = message["contents"];

		let decl: string;
		if (Array.isArray(contents)) {
			decl = contents[0];
		} else {
			decl = contents.value;
		}
		if (!decl) {
			return "";
		}
		decl = decl.split("\n")[0].trim();

		let match: RegExpMatchArray;
		let result = undefined;
		match = decl.match(/(?:func|const) (@?\w+)\.(\w+)/);
		if (match) {
			result = `${match[1]}.${match[2]}`;
		}

		match = decl.match(/<Native> class (\w+)/);
		if (match) {
			result = `${match[1]}`;
		}

		return result;
	}

	private on_connected() {
		if (this._initialize_request) {
			this.io.writer.write(this._initialize_request);
		}
		this.status = ClientStatus.CONNECTED;
	
		const host = get_configuration("lsp.serverHost");
		log.info(`connected to LSP at ${host}:${this.lastPortTried}`);
	}

	private on_disconnected() {
		if (this.target === TargetLSP.EDITOR) {
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

	// changeWorkspace(params: { path: string }) {
	// 	vscode.window.showErrorMessage("The GDScript language server can't work properly!\nThe open workspace is different from the editor's.", 'Reload', 'Ignore').then(item => {
	// 		if (item == "Reload") {
	// 			let folderUrl = vscode.Uri.file(params.path);
	// 			vscode.commands.executeCommand('vscode.openFolder', folderUrl, false);
	// 		}
	// 	});
	// }

	on_message(message: any) {
		// FIXME: Hot fix VSCode 1.42 hover position
		if (message && message.result && message.result.range && message.result.contents) {
			message.result.range = undefined;
		}

		// What does this do?
		if (message && message.method && (message.method as string).startsWith(CUSTOM_MESSAGE)) {
			const method = (message.method as string).substring(CUSTOM_MESSAGE.length, message.method.length);
			if (this[method]) {
				const ret = this[method](message.params);
				if (ret) {
					this.io.writer.write(ret);
				}
			}
		}
	}
}

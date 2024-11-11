import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	type NotificationMessage,
	type RequestMessage,
	type ResponseMessage,
} from "vscode-languageclient/node";
import { get_configuration, createLogger } from "../utils";
import { type Message, MessageIO, MessageIOReader, MessageIOWriter } from "./MessageIO";
import { globals } from "../extension";

const log = createLogger("lsp.client", { output: "Godot LSP" });

export enum ClientStatus {
	PENDING = 0,
	DISCONNECTED = 1,
	CONNECTED = 2,
}

export enum TargetLSP {
	HEADLESS = 0,
	EDITOR = 1,
}

export default class GDScriptLanguageClient extends LanguageClient {
	public io: MessageIO = new MessageIO();

	private _status_changed_callbacks: ((v: ClientStatus) => void)[] = [];
	private _initialize_request: Message = null;

	public target: TargetLSP = TargetLSP.EDITOR;

	public port = -1;
	public lastPortTried = -1;
	public sentMessages = new Map();
	public lastSymbolHovered = "";

	private _status: ClientStatus;
	public get status(): ClientStatus {
		return this._status;
	}
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
		const serverOptions: ServerOptions = () => {
			return new Promise((resolve, reject) => {
				resolve({ reader: this.io.reader, writer: this.io.writer });
			});
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [
				{ scheme: "file", language: "gdscript" },
				{ scheme: "untitled", language: "gdscript" },
			],
			synchronize: {
				fileEvents: vscode.workspace.createFileSystemWatcher("**/*.gd"),
			},
		};

		super("GDScriptLanguageClient", serverOptions, clientOptions);
		this.status = ClientStatus.PENDING;
		this.io.on("connected", this.on_connected.bind(this));
		this.io.on("disconnected", this.on_disconnected.bind(this));
		this.io.txFilter = this.txFilter.bind(this);
		this.io.rxFilter = this.rxFilter.bind(this);
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

		this.io.connect(host, port);
	}

	private txFilter(message: RequestMessage): RequestMessage | null {
		this.sentMessages.set(message.id, message);

		// discard outgoing messages that we know aren't supported
		if (message.method === "didChangeWatchedFiles") {
			return;
		}
		if (message.method === "workspace/symbol") {
			return;
		}

		return message;
	}

	private rxFilter(message: ResponseMessage | NotificationMessage): ResponseMessage | NotificationMessage | null {
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

		if ("method" in message) {
			if (message.method === "gdscript/capabilities") {
				globals.docsProvider.register_capabilities(message);
			}

			// if (message.method === "textDocument/publishDiagnostics") {
			// 	for (const diagnostic of message.params.diagnostics) {
			// 		if (diagnostic.code === 6) {
			// 			log.debug("UNUSED_SIGNAL", diagnostic);
			//             return;
			// 		}
			// 		if (diagnostic.code === 2) {
			// 			log.debug("UNUSED_VARIABLE", diagnostic);
			//             return;
			// 		}
			// 	}
			// }
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

		return message;
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
					this.io.connect(host, port);
					return;
				}
			}
		}
		this.status = ClientStatus.DISCONNECTED;
	}
}

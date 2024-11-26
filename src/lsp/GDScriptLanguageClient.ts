import EventEmitter from "node:events";
import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type NotificationMessage,
	type RequestMessage,
	type ResponseMessage,
	type ServerOptions,
} from "vscode-languageclient/node";

import { globals } from "../extension";
import { createLogger, get_configuration } from "../utils";
import { MessageIO } from "./MessageIO";

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

export type Target = {
	host: string;
	port: number;
    type: TargetLSP;
};

type HoverResult = {
	contents: {
		kind: string;
		value: string;
	};
	range: {
		end: {
			character: number;
			line: number;
		};
		start: {
			character: number;
			line: number;
		};
	};
};

type HoverResponseMesssage = {
	id: number;
	jsonrpc: string;
	result: HoverResult;
};

export default class GDScriptLanguageClient extends LanguageClient {
	public io: MessageIO = new MessageIO();

	public target: TargetLSP = TargetLSP.EDITOR;

	public port = -1;
	public lastPortTried = -1;
	public sentMessages = new Map();

	events = new EventEmitter();

	private _status: ClientStatus;

	public set status(v: ClientStatus) {
		this._status = v;
		this.events.emit("status", this._status);
	}

	constructor() {
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
		this.io.requestFilter = this.request_filter.bind(this);
		this.io.responseFilter = this.response_filter.bind(this);
		this.io.notificationFilter = this.notification_filter.bind(this);
	}

	connect(target: TargetLSP = TargetLSP.EDITOR) {
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

	private request_filter(message: RequestMessage) {
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

	private response_filter(message: ResponseMessage) {
		const sentMessage = this.sentMessages.get(message.id);
		if (sentMessage?.method === "textDocument/hover") {
			// fix markdown contents
			let value: string = (message as HoverResponseMesssage).result.contents.value;
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

				(message as HoverResponseMesssage).result.contents.value = value;
			}
		}

		return message;
	}

	private notification_filter(message: NotificationMessage) {
		if (message.method === "gdscript_client/changeWorkspace") {
			//
		}
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

		return message;
	}

	public async get_symbol_at_position(uri: vscode.Uri, position: vscode.Position) {
		const params = {
			textDocument: { uri: uri.toString() },
			position: { line: position.line, character: position.character },
		};
		const response: HoverResult = await this.sendRequest("textDocument/hover", params);

		return this.parse_hover_result(response);
	}

	private parse_hover_result(message: HoverResult) {
		const contents = message.contents;

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

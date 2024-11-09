import * as vscode from "vscode";
import {
	type MessageReader,
	type DataCallback,
	type Disposable,
	type RequestMessage,
	type ResponseMessage,
	type NotificationMessage,
	AbstractMessageWriter,
	AbstractMessageReader,
	type MessageWriter,
	type Event,
	type PartialMessageInfo,
	type Message,
} from "vscode-jsonrpc";
import { EventEmitter } from "node:events";
import { LanguageClient, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

import { WebSocket, type Data } from "ws";
import { Socket } from "net";
import MessageBuffer from "./MessageBuffer";
import { createLogger, get_configuration } from "../utils";

const log = createLogger("lsp.client2", { output: "Godot LSP2" });

// type Message = RequestMessage | ResponseMessage | NotificationMessage;

export default class GDScriptClient extends LanguageClient {
	public io: MessageIO = new MessageIO();

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
		log.debug("setup");

		this.io.on("connected", () => this.on_connected());
		this.io.on("disconnected", () => this.on_disconnected());
		// this.io.on("message", this.on_message.bind(this));
		// this.io.on("send_message", this.on_send_message.bind(this));
	}

	connect() {
		const port = get_configuration("lsp.serverPort");
		const host = get_configuration("lsp.serverHost");

		log.info(`attempting to connect to LSP at ${host}:${port}`);
		this.io.connect(host, port);

		this.start();
	}

	private on_connected() {
		log.info("connected to LSP");
	}

	private on_disconnected() {
		log.info("disconnected to LSP");
	}
}

class MessageIO extends EventEmitter {
	reader = new MessageIOReader(this);
	writer = new MessageIOWriter(this);

	socket: Socket = null;
	messageCache: string[] = [];

	async connect(host: string, port: number): Promise<void> {
		log.debug(`connecting to ${host}:${port}`);
		return new Promise((resolve, reject) => {
			this.socket = null;

			const socket = new Socket();
			socket.connect(port, host);

			socket.on("connect", () => {
				this.socket = socket;

				while (this.messageCache.length > 0) {
					const msg = this.messageCache.shift();
					this.socket.write(msg);
				}

				this.emit("connected");
				resolve();
			});
			socket.on("data", (chunk: Data) => {
				this.emit("data", chunk.toString());
			});
			// socket.on("end", this.on_disconnected.bind(this));
			socket.on("error", () => {
				this.socket = null;
				this.emit("disconnected");
			});
			socket.on("close", () => {
				this.socket = null;
				this.emit("disconnected");
			});
		});
	}

	write(message: string) {
		if (this.socket) {
			this.socket.write(message);
		} else {
			this.messageCache.push(message);
		}
	}
}

export class MessageIOReader extends AbstractMessageReader implements MessageReader {
	callback: DataCallback;
	private buffer = new MessageBuffer("utf8");
	private nextMessageLength: number;
	private messageToken: number;
	private partialMessageTimer: NodeJS.Timeout | undefined;
	private _partialMessageTimeout: number;

	constructor(public io: MessageIO) {
		super();
		this._partialMessageTimeout = 10000;
	}

	listen(callback: DataCallback): Disposable {
		this.nextMessageLength = -1;
		this.messageToken = 0;
		this.partialMessageTimer = undefined;

		this.callback = callback;

		this.io.on("data", (data) => this.onData(data));
		this.io.on("error", (e) => this.fireError(e));
		this.io.on("close", () => this.fireClose());
		return;
	}

	private onData(data: Buffer | string): void {
		this.buffer.append(data);
		while (true) {
			if (this.nextMessageLength === -1) {
				const headers = this.buffer.tryReadHeaders();
				if (!headers) {
					return;
				}
				const contentLength = headers["Content-Length"];
				if (!contentLength) {
					throw new Error("Header must provide a Content-Length property.");
				}
				const length = Number.parseInt(contentLength);
				if (Number.isNaN(length)) {
					throw new Error("Content-Length value must be a number.");
				}
				this.nextMessageLength = length;
			}
			const msg = this.buffer.tryReadContent(this.nextMessageLength);
			if (!msg) {
				this.setPartialMessageTimer();
				return;
			}
			this.clearPartialMessageTimer();
			this.nextMessageLength = -1;
			this.messageToken++;
			const json = JSON.parse(msg);

			log.debug("rx:", json);
			this.callback(json);
			// callback
			// this.io.on_message_callback(json);
		}
	}

	private clearPartialMessageTimer(): void {
		if (this.partialMessageTimer) {
			clearTimeout(this.partialMessageTimer);
			this.partialMessageTimer = undefined;
		}
	}
	private setPartialMessageTimer(): void {
		this.clearPartialMessageTimer();
		if (this._partialMessageTimeout <= 0) {
			return;
		}
		this.partialMessageTimer = setTimeout(
			(token, timeout) => {
				this.partialMessageTimer = undefined;
				if (token === this.messageToken) {
					this.firePartialMessage({ messageToken: token, waitingTime: timeout });
					this.setPartialMessageTimer();
				}
			},
			this._partialMessageTimeout,
			this.messageToken,
			this._partialMessageTimeout,
		);
	}
}

export class MessageIOWriter extends AbstractMessageWriter implements MessageWriter {
	private errorCount: number;

	constructor(public io: MessageIO) {
		super();
	}

	build_headers(json: string) {
		const contentLength = Buffer.byteLength(json, "utf-8").toString();
		return `Content-Length: ${contentLength}\r\n\r\n`;
	}

	write(msg: Message): Promise<void> {
		// discard outgoing messages that we know aren't supported
		if ((msg as RequestMessage).method === "didChangeWatchedFiles") {
			return;
		}
		if ((msg as RequestMessage).method === "workspace/symbol") {
			return;
		}
		const json = JSON.stringify(msg);
		const headers = this.build_headers(json);
		try {
			log.debug("tx:", msg);
			this.io.write(headers);
			this.io.write(json);
			this.errorCount = 0;
		} catch (error) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}

		return;
	}
	end(): void {}
}

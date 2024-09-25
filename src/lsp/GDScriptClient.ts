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
import type MessageBuffer from "./MessageBuffer";

// type Message = RequestMessage | ResponseMessage | NotificationMessage;

export default class GDScriptClient extends LanguageClient {
	public io: MessageIO;

	constructor(private context: vscode.ExtensionContext) {
		const serverOptions: ServerOptions = () => {
			return new Promise((resolve, reject) => {
				resolve({ reader: this.io.reader, writer: this.io.writer });
			});
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: "file", language: "gdscript" }],
			synchronize: {
				fileEvents: vscode.workspace.createFileSystemWatcher("**/*.gd"),
			},
		};

		super("GDScriptLanguageClient", serverOptions, clientOptions);
		this.io = new MessageIO();
	}
}

export class MessageIO extends EventEmitter {
	reader = new MessageIOReader(this);
	writer = new MessageIOWriter(this);

	socket: WebSocket = null;

	send_message(message: string) {
		if (this.socket) {
			this.socket.send(message);
		}
	}

	async connect(host: string, port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = null;
			const ws = new WebSocket(`ws://${host}:${port}`);
			ws.on("open", () => {
				this.socket = ws;
				this.emit("connected");
				resolve();
			});
			ws.on("message", (chunk: Data) => {
				this.emit("data", chunk.toString());
			});
			ws.on("error", () => {
				this.socket = null;
				this.emit("disconnected");
			});
			ws.on("close", () => {
				this.socket = null;
				this.emit("disconnected");
			});
		});
	}
}

export class MessageIOReader extends AbstractMessageReader implements MessageReader {
	io: MessageIO;
	callback: DataCallback;
	private buffer: MessageBuffer;
	private nextMessageLength: number;
	private messageToken: number;

	constructor(io: MessageIO) {
		super();
		this.io = io;
	}

	listen(callback: DataCallback): Disposable {
		this.callback = callback;

		this.io.on("data", this.onData.bind(this));
		this.io.on("error", this.fireError.bind(this));
		this.io.on("close", this.fireClose.bind(this));
		return;
	}

	private onData(data: Buffer | string): void {
		
	}
}

export class MessageIOWriter extends AbstractMessageWriter implements MessageWriter {
	io: MessageIO;

	constructor(io: MessageIO) {
		super();
		this.io = io;
	}

	write(msg: Message): Promise<void> {
		throw new Error("Method not implemented.");
	}
	end(): void {
		throw new Error("Method not implemented.");
	}
}

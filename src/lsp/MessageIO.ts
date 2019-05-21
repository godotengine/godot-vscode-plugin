import { AbstractMessageReader, MessageReader, DataCallback } from "vscode-jsonrpc/lib/messageReader";
import { EventEmitter } from "events";
import * as WebSocket  from 'ws';
import MessageBuffer from "./MessageBuffer";
import logger from "../loggger";
import { AbstractMessageWriter, MessageWriter } from "vscode-jsonrpc/lib/messageWriter";
import { Message } from "vscode-jsonrpc";

export class MessageIO extends EventEmitter {
	
	private socket: WebSocket = null; 
	private url: string = "";
	
	constructor(url: string) {
		super();
		this.url = url;
	}
	
	public send_message(message: string) {
		if (this.socket) {
			this.socket.send(message);
		}
		logger.log("[client]", message);
	}
	
	protected on_message(chunk: WebSocket.Data) {
		let message = chunk.toString();
		this.emit('data', message);
		logger.log("[server]", message);
	}
	
	connect_to_language_server():Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = null;
			const ws = new WebSocket(this.url);
			ws.on('open', ()=>{ this.on_connected(ws); resolve(); });
			ws.on('message', this.on_message.bind(this));
			ws.on('error', this.on_disconnected.bind(this));
			ws.on('close', this.on_disconnected.bind(this));
		});
	}
	
	private on_connected(socket: WebSocket) {
		this.socket = socket;
		this.emit("connected");
	}
	
	private on_disconnected() {
		this.socket = null;
		this.emit('disconnected');
	}
};


export class MessageIOReader extends AbstractMessageReader implements MessageReader {

	private io: MessageIO;
	private callback: DataCallback;
	private buffer: MessageBuffer;
	private nextMessageLength: number;
	private messageToken: number;
	private partialMessageTimer: NodeJS.Timer | undefined;
	private _partialMessageTimeout: number;

	public constructor(io: MessageIO, encoding: string = 'utf8') {
		super();
		this.io = io;
		this.buffer = new MessageBuffer(encoding);
		this._partialMessageTimeout = 10000;
	}

	public set partialMessageTimeout(timeout: number) {
		this._partialMessageTimeout = timeout;
	}

	public get partialMessageTimeout(): number {
		return this._partialMessageTimeout;
	}

	public listen(callback: DataCallback): void {
		this.nextMessageLength = -1;
		this.messageToken = 0;
		this.partialMessageTimer = undefined;
		this.callback = callback;
		this.io.on('data', (data: Buffer) => {
			this.onData(data);
		});
		this.io.on('error', (error: any) => this.fireError(error));
		this.io.on('close', () => this.fireClose());
	}

	private onData(data: Buffer | String): void {
		this.buffer.append(data);
		while (true) {
			if (this.nextMessageLength === -1) {
				let headers = this.buffer.tryReadHeaders();
				if (!headers) {
					return;
				}
				let contentLength = headers['Content-Length'];
				if (!contentLength) {
					throw new Error('Header must provide a Content-Length property.');
				}
				let length = parseInt(contentLength);
				if (isNaN(length)) {
					throw new Error('Content-Length value must be a number.');
				}
				this.nextMessageLength = length;
				// Take the encoding form the header. For compatibility
				// treat both utf-8 and utf8 as node utf8
			}
			var msg = this.buffer.tryReadContent(this.nextMessageLength);
			if (msg === null) {
				/** We haven't received the full message yet. */
				this.setPartialMessageTimer();
				return;
			}
			this.clearPartialMessageTimer();
			this.nextMessageLength = -1;
			this.messageToken++;
			var json = JSON.parse(msg);
			this.callback(json);
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
		this.partialMessageTimer = setTimeout((token, timeout) => {
			this.partialMessageTimer = undefined;
			if (token === this.messageToken) {
				this.firePartialMessage({ messageToken: token, waitingTime: timeout });
				this.setPartialMessageTimer();
			}
		}, this._partialMessageTimeout, this.messageToken, this._partialMessageTimeout);
	}
}

const ContentLength: string = 'Content-Length: ';
const CRLF = '\r\n';
export class MessageIOWriter extends AbstractMessageWriter implements MessageWriter {

	private io: MessageIO;
	private encoding: string;
	private errorCount: number;

	public constructor(io: MessageIO, encoding: string = 'utf8') {
		super();
		this.io = io;
		this.encoding = encoding;
		this.errorCount = 0;
		this.io.on('error', (error: any) => this.fireError(error));
		this.io.on('close', () => this.fireClose());
	}

	public write(msg: Message): void {
		let json = JSON.stringify(msg);
		let contentLength = Buffer.byteLength(json, this.encoding);

		let headers: string[] = [
			ContentLength, contentLength.toString(), CRLF,
			CRLF
		];
		try {
			// Header must be written in ASCII encoding
			this.io.send_message(headers.join(''));
			// Now write the content. This can be written in any encoding
			this.io.send_message(json);
			this.errorCount = 0;
		} catch (error) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}
	}
}

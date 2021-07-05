import { AbstractMessageReader, MessageReader, DataCallback, Disposable } from "vscode-jsonrpc";
import { EventEmitter } from "events";
import * as WebSocket from 'ws';
import { Socket } from 'net';

import MessageBuffer from "./MessageBuffer";
import { AbstractMessageWriter, MessageWriter } from "vscode-jsonrpc";
import { RequestMessage, ResponseMessage, NotificationMessage } from "vscode-jsonrpc";
export type Message = RequestMessage | ResponseMessage | NotificationMessage;

export class MessageIO extends EventEmitter {

	reader: MessageIOReader = null;
	writer: MessageIOWriter = null;

	public send_message(message: string) {
		// virtual
	}

	protected on_message(chunk: WebSocket.Data) {
		let message = chunk.toString();
		this.emit('data', message);
	}

	on_send_message(message: any) {
		this.emit("send_message", message);
	}

	on_message_callback(message: any) {
		this.emit("message", message);
	}

	async connect_to_language_server(port: number): Promise<void> {
		// virtual
	}
}


export class WebsocktMessageIO extends MessageIO {

	private socket: WebSocket = null;

	public send_message(message: string) {
		if (this.socket) {
			this.socket.send(message);
		}
	}

	async connect_to_language_server(port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = null;
			const ws = new WebSocket(`ws://localhost:${port}`);
			ws.on('open', ()=>{ this.on_connected(ws); resolve(); });
			ws.on('message', this.on_message.bind(this));
			ws.on('error', this.on_disconnected.bind(this));
			ws.on('close', this.on_disconnected.bind(this));
		});
	}

	protected on_connected(socket: WebSocket) {
		this.socket = socket;
		this.emit("connected");
	}

	protected on_disconnected() {
		this.socket = null;
		this.emit('disconnected');
	}
}

export class TCPMessageIO extends MessageIO {
	private socket: Socket = null;

	public send_message(message: string) {
		if (this.socket) {
			this.socket.write(message);
		}
	}

	async connect_to_language_server(port: number):Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = null;
			const socket = new Socket();
			socket.connect(port);
			socket.on('connect', ()=>{ this.on_connected(socket); resolve(); });
			socket.on('data', this.on_message.bind(this));
			socket.on('end', this.on_disconnected.bind(this));
			socket.on('close', this.on_disconnected.bind(this));
		});
	}

	protected on_connected(socket: Socket) {
		this.socket = socket;
		this.emit("connected");
	}

	protected on_disconnected() {
		this.socket = null;
		this.emit('disconnected');
	}
}


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
		this.io.reader = this;
		this.buffer = new MessageBuffer(encoding);
		this._partialMessageTimeout = 10000;
	}

	public set partialMessageTimeout(timeout: number) {
		this._partialMessageTimeout = timeout;
	}

	public get partialMessageTimeout(): number {
		return this._partialMessageTimeout;
	}

	public listen(callback: DataCallback): Disposable {
		this.nextMessageLength = -1;
		this.messageToken = 0;
		this.partialMessageTimer = undefined;
		this.callback = callback;
		this.io.on('data', (data: Buffer) => {
			this.onData(data);
		});
		this.io.on('error', (error: any) => this.fireError(error));
		this.io.on('close', () => this.fireClose());
		
		return;
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
			// callback
			this.io.on_message_callback(json);
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
		this.io.writer = this;
		this.encoding = encoding;
		this.errorCount = 0;
		this.io.on('error', (error: any) => this.fireError(error));
		this.io.on('close', () => this.fireClose());
	}
	
	public end(): void {
		
	}

	public write(msg: Message): Promise<void> {
		let json = JSON.stringify(msg);
		let contentLength = Buffer.byteLength(json, this.encoding);

		let headers: string[] = [
			ContentLength, contentLength.toString(), CRLF,
			CRLF
		];
		try {
			// callback
			this.io.on_send_message(msg);
			// Header must be written in ASCII encoding
			this.io.send_message(headers.join(''));
			// Now write the content. This can be written in any encoding
			this.io.send_message(json);
			this.errorCount = 0;
		} catch (error) {
			this.errorCount++;
			this.fireError(error, msg, this.errorCount);
		}
		
		return;
	}
}

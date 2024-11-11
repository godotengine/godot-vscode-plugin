import {
	AbstractMessageReader,
	type MessageReader,
	type DataCallback,
	type Disposable,
	type RequestMessage,
	type ResponseMessage,
	type NotificationMessage,
	AbstractMessageWriter,
	type MessageWriter,
} from "vscode-jsonrpc";
import { EventEmitter } from "node:events";
import { Socket } from "net";
import MessageBuffer from "./MessageBuffer";
import { createLogger } from "../utils";

const log = createLogger("lsp.io", { output: "Godot LSP" });

export type Message = RequestMessage | ResponseMessage | NotificationMessage;

export class MessageIO extends EventEmitter {
	reader = new MessageIOReader(this);
	writer = new MessageIOWriter(this);

	txHandler = (msg) => msg;
	rxHandler = (msg) => msg;

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
			socket.on("data", (chunk: Buffer) => {
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
	private _partialMessageTimeout = 10000;

	constructor(public io: MessageIO) {
		super();
	}

	listen(callback: DataCallback): Disposable {
		this.nextMessageLength = -1;
		this.messageToken = 0;
		this.partialMessageTimer = undefined;

		this.callback = callback;

		this.io.on("data", this.onData.bind(this));
		this.io.on("error", this.fireError.bind(this));
		this.io.on("close", this.fireClose.bind(this));
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
					log.warn("Header must provide a Content-Length property.");
					return;
				}
				const length = Number.parseInt(contentLength);
				if (Number.isNaN(length)) {
					log.warn("Content-Length value must be a number.");
					return;
				}
				this.nextMessageLength = length;
			}
			const msg = this.buffer.tryReadContent(this.nextMessageLength);
			if (!msg) {
				log.warn("haven't recieved full message");
				this.setPartialMessageTimer();
				return;
			}
			this.clearPartialMessageTimer();
			this.nextMessageLength = -1;
			this.messageToken++;
			const json = JSON.parse(msg);
			// allow message to be modified
			const modified = this.io.rxHandler(json);

			if (!modified) {
				log.debug("rx [discarded]:", json);
				return;
			}
			log.debug("rx:", modified);
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

	write(msg: Message): Promise<void> {
		const modified = this.io.txHandler(msg);
		if (!modified) {
			log.debug("tx [discarded]:", msg);
			return;
		}
		log.debug("tx:", modified);
		const json = JSON.stringify(modified);

		const contentLength = Buffer.byteLength(json, "utf-8").toString();
		const message = `Content-Length: ${contentLength}\r\n\r\n${json}`;
		try {
			this.io.write(message);
			this.errorCount = 0;
		} catch (error) {
			this.errorCount++;
			this.fireError(error, modified, this.errorCount);
		}

		return;
	}

	end(): void {}
}

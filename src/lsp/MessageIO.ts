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

	requestFilter: (msg: RequestMessage) => RequestMessage = (msg) => msg;
	responseFilter: (msg: ResponseMessage) => ResponseMessage = (msg) => msg;
	notificationFilter: (msg: NotificationMessage) => NotificationMessage = (msg) => msg;

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
	private buffer = new MessageBuffer(this);

	constructor(public io: MessageIO) {
		super();
	}

	listen(callback: DataCallback): Disposable {
		this.buffer.reset();

		this.callback = callback;

		this.io.on("data", this.on_data.bind(this));
		this.io.on("error", this.fireError.bind(this));
		this.io.on("close", this.fireClose.bind(this));
		return;
	}

	private on_data(data: Buffer | string): void {
		this.buffer.append(data);
		while (true) {
			const msg = this.buffer.ready();
			if (!msg) {
				return;
			}
			const json = JSON.parse(msg);
			// allow message to be modified
			let modified: ResponseMessage | NotificationMessage;
			if ("id" in json) {
				modified = this.io.responseFilter(json);
			} else if ("method" in json) {
				modified = this.io.notificationFilter(json);
			} else {
				log.warn("rx [unhandled]:", json);
			}

			if (!modified) {
				log.debug("rx [discarded]:", json);
				return;
			}
			log.debug("rx:", modified);
			this.callback(json);
		}
	}
}

export class MessageIOWriter extends AbstractMessageWriter implements MessageWriter {
	private errorCount: number;

	constructor(public io: MessageIO) {
		super();
	}

	async write(msg: RequestMessage) {
		const modified = this.io.requestFilter(msg);
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
	}

	end(): void {}
}

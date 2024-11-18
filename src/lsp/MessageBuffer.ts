/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { createLogger } from "../utils";

const log = createLogger("lsp.buf");

const DefaultSize: number = 8192;
const CR: number = Buffer.from("\r", "ascii")[0];
const LF: number = Buffer.from("\n", "ascii")[0];
const CRLF: string = "\r\n";

type Headers = { [key: string]: string };

export default class MessageBuffer {
	private encoding: BufferEncoding = "utf8";
	private index = 0;
	private buffer: Buffer = Buffer.allocUnsafe(DefaultSize);

	private nextMessageLength: number;
	private messageToken: number;
	private partialMessageTimer: NodeJS.Timeout | undefined;
	private _partialMessageTimeout = 10000;

	constructor(private reader) {}

	public append(chunk: Buffer | string): void {
		let toAppend: Buffer = <Buffer>chunk;
		if (typeof chunk === "string") {
			const str = <string>chunk;
			const bufferLen = Buffer.byteLength(str, this.encoding);
			toAppend = Buffer.allocUnsafe(bufferLen);
			toAppend.write(str, 0, bufferLen, this.encoding);
		}
		if (this.buffer.length - this.index >= toAppend.length) {
			toAppend.copy(this.buffer, this.index, 0, toAppend.length);
		} else {
			const newSize = (Math.ceil((this.index + toAppend.length) / DefaultSize) + 1) * DefaultSize;
			if (this.index === 0) {
				this.buffer = Buffer.allocUnsafe(newSize);
				toAppend.copy(this.buffer, 0, 0, toAppend.length);
			} else {
				this.buffer = Buffer.concat([this.buffer.slice(0, this.index), toAppend], newSize);
			}
		}
		this.index += toAppend.length;
	}

	public tryReadHeaders(): Headers | undefined {
		let current = 0;
		while (
			current + 3 < this.index &&
			(this.buffer[current] !== CR ||
				this.buffer[current + 1] !== LF ||
				this.buffer[current + 2] !== CR ||
				this.buffer[current + 3] !== LF)
		) {
			current++;
		}
		// No header / body separator found (e.g CRLFCRLF)
		if (current + 3 >= this.index) {
			return undefined;
		}
		const result = Object.create(null);
		const headers = this.buffer.toString("ascii", 0, current).split(CRLF);
		for (const header of headers) {
			const index: number = header.indexOf(":");
			if (index === -1) {
				throw new Error("Message header must separate key and value using :");
			}
			const key = header.substr(0, index);
			const value = header.substr(index + 1).trim();
			result[key] = value;
		}

		const nextStart = current + 4;
		this.buffer = this.buffer.slice(nextStart);
		this.index = this.index - nextStart;
		return result;
	}

	public tryReadContent(length: number): string | null {
		if (this.index < length) {
			return null;
		}
		const result = this.buffer.toString(this.encoding, 0, length);
		const nextStart = length;
		this.buffer.copy(this.buffer, 0, nextStart);
		this.index = this.index - nextStart;
		return result;
	}

	public ready() {
		if (this.nextMessageLength === -1) {
			const headers = this.tryReadHeaders();
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
		const msg = this.tryReadContent(this.nextMessageLength);
		if (!msg) {
			log.warn("haven't recieved full message");
			this.setPartialMessageTimer();
			return;
		}
		this.clearPartialMessageTimer();
		this.nextMessageLength = -1;
		this.messageToken++;

		return msg;
	}

	public reset() {
		this.nextMessageLength = -1;
		this.messageToken = 0;
		this.partialMessageTimer = undefined;
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
					this.reader.firePartialMessage({ messageToken: token, waitingTime: timeout });
					this.setPartialMessageTimer();
				}
			},
			this._partialMessageTimeout,
			this.messageToken,
			this._partialMessageTimeout,
		);
	}
}

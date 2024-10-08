/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

const DefaultSize: number = 8192;
const CR: number = Buffer.from("\r", "ascii")[0];
const LF: number = Buffer.from("\n", "ascii")[0];
const CRLF: string = "\r\n";

export default class MessageBuffer {
	private encoding: BufferEncoding;
	private index: number;
	private buffer: Buffer;

	constructor(encoding = "utf8") {
		this.encoding = encoding as BufferEncoding;
		this.index = 0;
		this.buffer = Buffer.allocUnsafe(DefaultSize);
	}

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

	public tryReadHeaders(): { [key: string]: string } | undefined {
		let result: { [key: string]: string } | undefined = undefined;
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
			return result;
		}
		result = Object.create(null);
		const headers = this.buffer.toString("ascii", 0, current).split(CRLF);
        for (const header of headers) {
			const index: number = header.indexOf(":");
			if (index === -1) {
				throw new Error("Message header must separate key and value using :");
			}
			const key = header.substr(0, index);
			const value = header.substr(index + 1).trim();
			result![key] = value;
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

	public get numberOfBytes(): number {
		return this.index;
	}
}

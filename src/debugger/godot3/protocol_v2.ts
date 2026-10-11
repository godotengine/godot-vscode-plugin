import { VariantDecoder } from "./variables/variant_decoder";
import { VariantEncoder } from "./variables/variant_encoder";

export const DEBUG_PROTOCOL_V2_MAGIC = "GDDBG2";
export const DEBUG_PROTOCOL_V2_MAJOR = 2;
export const DEBUG_PROTOCOL_V2_MINOR = 0;
export const DEBUG_PROTOCOL_V2_FIELDS = 11;

export enum DebugChannelV2 {
	Control = 0,
	Data = 1,
}

export interface DebugEnvelopeV2 {
	sessionId: bigint;
	generation: number;
	channel: DebugChannelV2;
	sequence: bigint;
	requestId: bigint;
	stopId: bigint;
	type: string;
	payload: any[];
}

function integer(value: unknown, field: string): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
	throw new Error(`Debugger v2 ${field} must be an integer`);
}

export function decodeEnvelopeV2(packet: unknown): DebugEnvelopeV2 {
	if (!Array.isArray(packet) || packet.length !== DEBUG_PROTOCOL_V2_FIELDS) {
		throw new Error("Debugger v2 envelope has an invalid field count");
	}
	if (packet[0] !== DEBUG_PROTOCOL_V2_MAGIC) throw new Error("Debugger v2 envelope has invalid magic");
	if (integer(packet[1], "major") !== BigInt(DEBUG_PROTOCOL_V2_MAJOR) || integer(packet[2], "minor") !== BigInt(DEBUG_PROTOCOL_V2_MINOR)) {
		throw new Error("Debugger v2 envelope has an incompatible protocol version");
	}
	const channel = Number(integer(packet[5], "channel"));
	if (channel !== DebugChannelV2.Control && channel !== DebugChannelV2.Data) {
		throw new Error("Debugger v2 envelope has an invalid channel");
	}
	if (typeof packet[9] !== "string" || !Array.isArray(packet[10])) {
		throw new Error("Debugger v2 envelope has an invalid body");
	}
	return {
		sessionId: integer(packet[3], "session id"),
		generation: Number(integer(packet[4], "generation")),
		channel,
		sequence: integer(packet[6], "sequence"),
		requestId: integer(packet[7], "request id"),
		stopId: integer(packet[8], "stop id"),
		type: packet[9],
		payload: packet[10],
	};
}

export function encodeEnvelopeV2(message: DebugEnvelopeV2): Buffer {
	const packet = [
		DEBUG_PROTOCOL_V2_MAGIC,
		DEBUG_PROTOCOL_V2_MAJOR,
		DEBUG_PROTOCOL_V2_MINOR,
		message.sessionId,
		message.generation,
		message.channel,
		message.sequence,
		message.requestId,
		message.stopId,
		message.type,
		message.payload,
	];
	return new VariantEncoder().encode_variant(packet);
}

/** Incrementally decodes PacketPeerStream frames, including split and coalesced TCP chunks. */
export class DebugPacketStreamV2 {
	private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
	private readonly decoder = new VariantDecoder();

	public constructor(private readonly maxPacketBytes = 16 * 1024 * 1024) {}

	public push(chunk: Buffer): DebugEnvelopeV2[] {
		if (chunk.length === 0) return [];
		this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
		const messages: DebugEnvelopeV2[] = [];
		while (this.buffer.length >= 4) {
			const bodyLength = this.buffer.readUInt32LE(0);
			if (bodyLength <= 0 || bodyLength > this.maxPacketBytes) {
				this.buffer = Buffer.alloc(0);
				throw new Error(`Debugger v2 packet length ${bodyLength} is invalid`);
			}
			const packetLength = bodyLength + 4;
			if (this.buffer.length < packetLength) break;
			const packet = this.buffer.subarray(0, packetLength);
			this.buffer = this.buffer.subarray(packetLength);
			const dataset = this.decoder.get_dataset(packet);
			if (!dataset || dataset.length !== 2) throw new Error("Debugger v2 packet must contain exactly one Variant");
			messages.push(decodeEnvelopeV2(dataset[1]));
		}
		return messages;
	}

	public reset() {
		this.buffer = Buffer.alloc(0);
	}
}

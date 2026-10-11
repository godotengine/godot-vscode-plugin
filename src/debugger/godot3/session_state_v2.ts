import { DebugChannelV2, DebugEnvelopeV2 } from "./protocol_v2";

export interface DebugPairV2 {
	sessionId: bigint;
	generation: number;
	control: unknown;
	data: unknown;
}

interface CandidatePairV2 {
	control?: unknown;
	data?: unknown;
}

export class DebugChannelPairerV2 {
	private candidates = new Map<string, CandidatePairV2>();

	public accept(hello: DebugEnvelopeV2, connection: unknown): DebugPairV2 | undefined {
		const expected = hello.channel === DebugChannelV2.Control ? "control_hello" : "data_hello";
		if (hello.type !== expected) throw new Error(`Expected ${expected}, received ${hello.type}`);
		const key = `${hello.sessionId}:${hello.generation}`;
		const candidate = this.candidates.get(key) ?? {};
		const role = hello.channel === DebugChannelV2.Control ? "control" : "data";
		if (candidate[role]) throw new Error(`Duplicate debugger v2 ${role} channel`);
		candidate[role] = connection;
		this.candidates.set(key, candidate);
		if (!candidate.control || !candidate.data) return undefined;
		this.candidates.delete(key);
		return { sessionId: hello.sessionId, generation: hello.generation, control: candidate.control, data: candidate.data };
	}

	public discard(connection: unknown) {
		for (const [key, candidate] of this.candidates) {
			if (candidate.control === connection || candidate.data === connection) this.candidates.delete(key);
		}
	}
}

export type ExecutionCommandV2 = "pause" | "continue" | "step" | "next" | "step_out";

export interface StopPresentationV2 {
	reason: "breakpoint" | "exception";
	text?: string;
}

export function stopPresentationV2(error: string, isError: boolean): StopPresentationV2 {
	if (!isError) return { reason: "breakpoint" };
	return error ? { reason: "exception", text: error } : { reason: "exception" };
}

export class DebugSessionStateV2 {
	public sessionId = 0n;
	public generation = 0;
	public stopId = 0n;
	public paused = false;
	private nextRequestId = 1n;
	private sequences = [0n, 0n];
	private completedAcks = new Set<bigint>();

	public activate(pair: DebugPairV2) {
		if (this.sessionId !== 0n && pair.sessionId !== this.sessionId) throw new Error("Debugger v2 session id changed during reconnect");
		if (this.generation !== 0 && pair.generation <= this.generation) throw new Error("Debugger v2 generation did not increase");
		this.sessionId = pair.sessionId;
		this.generation = pair.generation;
		this.sequences = [1n, 1n];
	}

	public nextEnvelope(channel: DebugChannelV2, type: string, payload: any[] = [], stopId = this.stopId): DebugEnvelopeV2 {
		const requestId = this.nextRequestId++;
		return this.envelope(channel, type, payload, requestId, stopId);
	}

	public envelope(channel: DebugChannelV2, type: string, payload: any[], requestId: bigint, stopId: bigint): DebugEnvelopeV2 {
		this.sequences[channel] += 1n;
		return { sessionId: this.sessionId, generation: this.generation, channel, sequence: this.sequences[channel], requestId, stopId, type, payload };
	}

	public receive(message: DebugEnvelopeV2): "accepted" | "duplicate" {
		if (message.sessionId !== this.sessionId || message.generation !== this.generation) throw new Error("Debugger v2 message belongs to a stale session");
		if (message.stopId !== 0n && message.stopId < this.stopId) throw new Error("Debugger v2 message belongs to a stale stop");
		if (message.type === "stopped") {
			this.stopId = message.stopId;
			this.paused = true;
		}
		if (message.type === "running") this.paused = false;
		if (message.type === "ack") {
			if (this.completedAcks.has(message.requestId)) return "duplicate";
			this.completedAcks.add(message.requestId);
		}
		return "accepted";
	}

	public validateExecution(command: ExecutionCommandV2) {
		if (command !== "pause" && !this.paused) throw new Error(`Cannot ${command}: debugger is not paused`);
	}
}

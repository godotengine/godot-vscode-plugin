import { strict as assert } from "node:assert";
import { DebugChannelV2, DebugEnvelopeV2, DebugPacketStreamV2, decodeEnvelopeV2, encodeEnvelopeV2 } from "./protocol_v2";

suite("Godot 4 debugger protocol v2", () => {
	const message: DebugEnvelopeV2 = { sessionId: 9_007_199_254_740_993n, generation: 2, channel: DebugChannelV2.Control, sequence: 7n, requestId: 5n, stopId: 3n, type: "next", payload: [true, "ok"] };

	test("round trips an envelope without losing 64-bit ids", () => {
		const stream = new DebugPacketStreamV2();
		assert.deepEqual(stream.push(encodeEnvelopeV2(message)), [message]);
	});

	test("handles partial and coalesced TCP buffers", () => {
		const first = encodeEnvelopeV2(message);
		const second = encodeEnvelopeV2({ ...message, sequence: 8n, requestId: 6n });
		const stream = new DebugPacketStreamV2();
		assert.deepEqual(stream.push(first.subarray(0, 3)), []);
		assert.deepEqual(stream.push(Buffer.concat([first.subarray(3), second])).map((item) => item.requestId), [5n, 6n]);
	});

	test("rejects incompatible versions", () => {
		assert.throws(() => decodeEnvelopeV2(["GDDBG2", 3, 0, 1, 1, 0, 1, 1, 0, "hello", []]), /incompatible/);
	});
});

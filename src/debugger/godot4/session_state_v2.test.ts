import { strict as assert } from "node:assert";
import { DebugChannelV2, DebugEnvelopeV2 } from "./protocol_v2";
import { DebugChannelPairerV2, DebugSessionStateV2, stopPresentationV2 } from "./session_state_v2";

function hello(channel: DebugChannelV2, generation = 1): DebugEnvelopeV2 {
	return { sessionId: 42n, generation, channel, sequence: 1n, requestId: 1n, stopId: 0n, type: channel === DebugChannelV2.Control ? "control_hello" : "data_hello", payload: [] };
}

suite("Godot 4 debugger session v2", () => {
	test("pairs only matching control and data channels", () => {
		const pairer = new DebugChannelPairerV2();
		assert.equal(pairer.accept(hello(DebugChannelV2.Control), "control"), undefined);
		assert.deepEqual(pairer.accept(hello(DebugChannelV2.Data), "data"), { sessionId: 42n, generation: 1, control: "control", data: "data" });
	});

	test("rejects duplicate channels", () => {
		const pairer = new DebugChannelPairerV2();
		pairer.accept(hello(DebugChannelV2.Control), "a");
		assert.throws(() => pairer.accept(hello(DebugChannelV2.Control), "b"), /Duplicate/);
	});

	test("deduplicates acknowledgements and rejects stale stops", () => {
		const state = new DebugSessionStateV2();
		state.activate({ sessionId: 42n, generation: 1, control: {}, data: {} });
		const stopped = { ...hello(DebugChannelV2.Control), type: "stopped", requestId: 0n, stopId: 4n };
		assert.equal(state.receive(stopped), "accepted");
		const ack = { ...stopped, type: "ack", requestId: 8n };
		assert.equal(state.receive(ack), "accepted");
		assert.equal(state.receive(ack), "duplicate");
		assert.throws(() => state.receive({ ...stopped, type: "running", stopId: 3n }), /stale stop/);
	});

	test("requires a newer generation when reconnecting", () => {
		const state = new DebugSessionStateV2();
		state.activate({ sessionId: 42n, generation: 1, control: {}, data: {} });
		assert.throws(() => state.activate({ sessionId: 42n, generation: 1, control: {}, data: {} }), /generation/);
		state.activate({ sessionId: 42n, generation: 2, control: {}, data: {} });
	});

	test("presents ordinary stops without exception text", () => {
		assert.deepEqual(stopPresentationV2("Breakpoint", false), { reason: "breakpoint" });
		assert.deepEqual(stopPresentationV2("Invalid get index", true), { reason: "exception", text: "Invalid get index" });
	});

	test("accepts step out while paused", () => {
		const state = new DebugSessionStateV2();
		state.activate({ sessionId: 42n, generation: 1, control: {}, data: {} });
		state.receive({ ...hello(DebugChannelV2.Control), type: "stopped", requestId: 0n, stopId: 4n });
		assert.doesNotThrow(() => state.validateExecution("step_out"));
	});
});

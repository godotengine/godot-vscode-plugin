import { use as chai_use, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import { GodotRequestResponseManager } from "./godot_request_response_manager";
import { Command } from "../server_controller";
import { DecodedVariant } from "./variant_decoder";

chai_use(chaiAsPromised);

suite("GodotRequestResponseManager", () => {
	let manager: GodotRequestResponseManager;
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		manager = new GodotRequestResponseManager();
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	function createCommand(commandName: string, returnValue: any): Command {
		const cmd = new Command();
		cmd.command = commandName;
		cmd.parameters = [null, null, null, returnValue] as any;
		return cmd;
	}

	test("resolves propogates value", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({
				handled: true,
				value: cmd.parameters[3],
			})
		);

		manager.resolve("evaluation_return", createCommand("evaluation_return", 123), true);

		await expect(promise).to.eventually.equal(123);
	});

	test("matches based on command name and parameter value", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) =>
				cmd.parameters[3] === "evaluation_return_response"
					? { handled: true, value: cmd.parameters[3] }
					: { handled: false }
		);

		manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response"), true);

		await expect(promise).to.eventually.equal("evaluation_return_response");
	});

	test("does not match if parameters[3] differs", () => {
		manager.get_server_response(
			"evaluation_return",
			(cmd) =>
				cmd.parameters[3] === "evaluation_return_response"
					? { handled: true, value: cmd.parameters[3] }
					: { handled: false }
		);

		expect(() =>
			manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response_B"), true)
		).to.throw("No waiter found");
	});

	test("multiple waiters match different parameter values", async () => {
		const p1 = manager.get_server_response(
			"evaluation_return",
			(cmd) =>
				cmd.parameters[3] === "evaluation_return_response_A"
					? { handled: true, value: "A" }
					: { handled: false }
		);

		const p2 = manager.get_server_response(
			"evaluation_return",
			(cmd) =>
				cmd.parameters[3] === "evaluation_return_response_B"
					? { handled: true, value: "B" }
					: { handled: false }
		);

		manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response_B"), true);		
		await expect(p2).to.eventually.equal("B");
		
		manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response_A"), true);
		await expect(p1).to.eventually.equal("A");
	});

	test("only first matching waiter is resolved", async () => {
		const results: any[] = [];

		const p1 = manager.get_server_response(
			"evaluation_return",
			() => ({ handled: true, value: "A" })
		).then(v => results.push(v));

		const p2 = manager.get_server_response(
			"evaluation_return",
			() => ({ handled: true, value: "B" })
		).then(v => results.push(v));

		manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response_A"), true);		
		await p1;
		expect(results).to.deep.equal(["A"]);

		manager.resolve("evaluation_return", createCommand("evaluation_return", "evaluation_return_response_B"), true);
		await p2;
		expect(results).to.deep.equal(["A", "B"]);
	});

	test("delete_matching_promise removes waiter", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({ handled: true, value: cmd.parameters[3] })
		);

		manager.resolve("evaluation_return", createCommand("evaluation_return", 1), true);

		await expect(promise).to.eventually.equal(1);

		expect(() =>
			manager.resolve("evaluation_return", createCommand("evaluation_return", 2), true)
		).to.throw("No waiter found");
	});

	test("non-deleted waiter can match again", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({ handled: true, value: cmd.parameters[3] })
		);

		manager.resolve("evaluation_return", createCommand("evaluation_return", 1), false);

		await expect(promise).to.eventually.equal(1);

		// Same matcher still exists
		manager.resolve("evaluation_return", createCommand("evaluation_return", 2), false);
	});

	test("throws if resolving unknown command group", () => {
		expect(() =>
			manager.resolve("unknown", createCommand("unknown", 1), true)
		).to.throw("No waiter found for command unknown");
	});

	test("timeout rejects promise", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({ handled: true, value: cmd.parameters[3] }),
			1000
		);

		clock.tick(1000);

		await expect(promise).to.be.rejected;
	});

	test("resolves before timeout", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({ handled: true, value: cmd.parameters[3] }),
			1000
		);

		clock.tick(500);

		manager.resolve("evaluation_return", createCommand("evaluation_return", 42), true);

		await expect(promise).to.eventually.equal(42);
	});

	test("multiple sequential resolves work correctly", async () => {
		const results: DecodedVariant[] = [];

		manager
			.get_server_response("evaluation_return", (cmd) => ({
				handled: true,
				value: cmd.parameters[3],
			}))
			.then(v => results.push(v));

		manager
			.get_server_response("evaluation_return", (cmd) => ({
				handled: true,
				value: cmd.parameters[3],
			}))
			.then(v => results.push(v));

		manager.resolve("evaluation_return", createCommand("evaluation_return", 10), true);
		manager.resolve("evaluation_return", createCommand("evaluation_return", 20), true);

		await clock.runAllAsync();

		expect(results).to.deep.equal([10, 20]);
	});

	test("rejects promise when timeout is reached (robust)", async () => {
		const promise = manager.get_server_response(
			"evaluation_return",
			(cmd) => ({ handled: true, value: cmd.parameters[3] }),
			1000
		);

		clock.tick(1000);

		await expect(promise).to.be.rejected;
	});
});

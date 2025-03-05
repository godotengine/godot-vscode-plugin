import sinon from "sinon";
import chai from "chai";
import { GodotObject, GodotObjectPromise } from "./godot_object_promise";
// import chaiAsPromised from "chai-as-promised";
// eslint-disable-next-line @typescript-eslint/no-var-requires
var chaiAsPromised = import("chai-as-promised");
// const chaiAsPromised = await import("chai-as-promised"); // TODO: use after migration to ECMAScript modules

chaiAsPromised.then((module) => {
	chai.use(module.default);
});
const { expect } = chai;

suite("GodotObjectPromise", () => {
	let clock;

	setup(() => {
		clock = sinon.useFakeTimers(); // Use Sinon to control time
	});

	teardown(() => {
		clock.restore(); // Restore the real timers after each test
	});

	test("resolves successfully with a valid GodotObject", async () => {
		const godotObject: GodotObject = {
			godot_id: BigInt(1),
			type: "TestType",
			sub_values: [],
		};

		const promise = new GodotObjectPromise();
		setTimeout(() => promise.resolve(godotObject), 10);
		clock.tick(10); // Fast-forward time
		await expect(promise.promise).to.eventually.equal(godotObject);
	});

	test("rejects with an error when explicitly called", async () => {
		const promise = new GodotObjectPromise();
		const error = new Error("Test rejection");
		setTimeout(() => promise.reject(error), 10);
		clock.tick(10); // Fast-forward time
		await expect(promise.promise).to.be.rejectedWith("Test rejection");
	});

	test("rejects due to timeout", async () => {
		const promise = new GodotObjectPromise(50);
		clock.tick(50); // Fast-forward time
		await expect(promise.promise).to.be.rejectedWith("GodotObjectPromise timed out");
	});

	test("does not reject if resolved before timeout", async () => {
		const godotObject: GodotObject = {
			godot_id: BigInt(2),
			type: "AnotherTestType",
			sub_values: [],
		};

		const promise = new GodotObjectPromise(100);
		setTimeout(() => promise.resolve(godotObject), 10);
		clock.tick(10); // Fast-forward time
		await expect(promise.promise).to.eventually.equal(godotObject);
	});

	test("clears timeout when resolved", async () => {
		const promise = new GodotObjectPromise(1000);
		promise.resolve({ godot_id: BigInt(3), type: "ResolvedType", sub_values: [] });
		clock.tick(1000); // Fast-forward time
		await expect(promise.promise).to.eventually.be.fulfilled;
	});

	test("clears timeout when rejected", async () => {
		const promise = new GodotObjectPromise(1000);
		promise.reject(new Error("Rejected"));
		clock.tick(1000); // Fast-forward time
		await expect(promise.promise).to.be.rejectedWith("Rejected");
	});
});

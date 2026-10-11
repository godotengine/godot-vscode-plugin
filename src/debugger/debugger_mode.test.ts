import { strictEqual } from "node:assert";
import { select_debugger_mode } from "./debugger_mode";

suite("Debugger protocol selection", () => {
	test("uses the legacy adapter by default for stock Godot 3 and 4", () => {
		strictEqual(select_debugger_mode("3.6.2", undefined), "godot3-legacy");
		strictEqual(select_debugger_mode("4.6.2", false), "godot4-legacy");
	});

	test("enables v2 only for the selected project major version", () => {
		strictEqual(select_debugger_mode("3.6.2", true), "godot3-v2");
		strictEqual(select_debugger_mode("4.6.2", true), "godot4-v2");
	});

	test("does not treat a truthy string as an opt-in", () => {
		strictEqual(select_debugger_mode("3.6.2", "true"), "godot3-legacy");
	});
});

import { promises as fs } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DebugProtocol } from "@vscode/debugprotocol";
import chai from "chai";
import chaiSubset from "chai-subset";
var chaiAsPromised = import("chai-as-promised");
// const chaiAsPromised = await import("chai-as-promised"); // TODO: use after migration to ECMAScript modules

chaiAsPromised.then((module) => {
	chai.use(module.default);
});

import { promisify } from "util";
import { execFile } from "child_process";
const execFileAsync = promisify(execFile);

chai.use(chaiSubset);
const { expect } = chai;

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Given a path to a script, returns an object where each key is the name of a
 * breakpoint (delimited by `breakpoint::`) and each value is the line number
 * where the breakpoint appears in the script.
 *
 * @param scriptPath The path to the script to scan.
 * @returns An object of breakpoint names to line numbers.
 */
async function getBreakpointLocations(scriptPath: string): Promise<{ [key: string]: vscode.Location }> {
	const script_content = await fs.readFile(scriptPath, "utf-8");
	const breakpoints: { [key: string]: vscode.Location } = {};
	const breakpointRegex = /\b(breakpoint::.*)\b/g;
	let match: RegExpExecArray | null;
	while ((match = breakpointRegex.exec(script_content)) !== null) {
		const breakpointName = match[1];
		const line = match.index ? script_content.substring(0, match.index).split("\n").length : 1;
		breakpoints[breakpointName] = new vscode.Location(
			vscode.Uri.file(scriptPath),
			new vscode.Position(line - 1, 0),
		);
	}
	return breakpoints;
}

async function waitForActiveStackItemChange(
	ms: number = 10000,
): Promise<vscode.DebugThread | vscode.DebugStackFrame | undefined> {
	const res = await new Promise<vscode.DebugThread | vscode.DebugStackFrame | undefined>((resolve, reject) => {
		const debugListener = vscode.debug.onDidChangeActiveStackItem((event) => {
			debugListener.dispose();
			resolve(vscode.debug.activeStackItem);
		});

		// Timeout fallback in case stack item never changes
		setTimeout(() => {
			debugListener.dispose();
			console.warn();
			reject(new Error(`The ActiveStackItem eventwas not changed within the timeout period of '${ms}'`));
		}, ms);
	});

	return res;
}

async function getStackFrames(threadId: number = 1): Promise<DebugProtocol.StackFrame[]> {
	// Ensure there is an active debug session
	if (!vscode.debug.activeDebugSession) {
		throw new Error("No active debug session found");
	}

	// corresponds to file://./debug_session.ts stackTraceRequest(...)
	const stackTraceResponse = await vscode.debug.activeDebugSession.customRequest("stackTrace", {
		threadId: threadId,
	});

	// Extract and return the stack frames
	return stackTraceResponse.stackFrames || [];
}

async function waitForBreakpoint(
	breakpoint: vscode.SourceBreakpoint,
	timeoutMs: number,
	ctx?: Mocha.Context,
): Promise<void> {
	const t0 = performance.now();
	console.log(
		fmt(
			`Waiting for breakpoint ${breakpoint.location.uri.path}:${breakpoint.location.range.start.line}, enabled: ${breakpoint.enabled}`,
		),
	);
	const res = await waitForActiveStackItemChange(timeoutMs);
	const t1 = performance.now();
	console.log(
		fmt(
			`Waiting for breakpoint completed ${breakpoint.location.uri.path}:${breakpoint.location.range.start.line}, enabled: ${breakpoint.enabled}, took ${t1 - t0}ms`,
		),
	);
	const stackFrames = await getStackFrames();
	if (
		stackFrames[0].source.path !== breakpoint.location.uri.fsPath ||
		stackFrames[0].line != breakpoint.location.range.start.line + 1
	) {
		throw new Error(
			`Wrong breakpoint was hit. Expected: ${breakpoint.location.uri.fsPath}:${breakpoint.location.range.start.line + 1}, Got: ${stackFrames[0].source.path}:${stackFrames[0].line}`,
		);
	}
}

enum VariableScope {
	Locals,
	Members,
	Globals,
}

async function getVariablesForVSCodeID(vscode_id: number): Promise<DebugProtocol.Variable[]> {
	// corresponds to file://./debug_session.ts protected async variablesRequest
	const variablesResponse = await vscode.debug.activeDebugSession?.customRequest("variables", {
		variablesReference: vscode_id,
	});
	return variablesResponse?.variables || [];
}

async function getVariablesForScope(
	scope: VariableScope,
	stack_frame_id: number = 0,
): Promise<DebugProtocol.Variable[]> {
	const res_scopes = await vscode.debug.activeDebugSession.customRequest("scopes", { frameId: stack_frame_id });
	const scope_name = VariableScope[scope];
	const scope_res = res_scopes.scopes.find((s) => s.name == scope_name);
	if (scope_res === undefined) {
		throw new Error(`No ${scope_name} scope found in responce from "scopes" request`);
	}
	const vscode_id = scope_res.variablesReference;
	const variables = await getVariablesForVSCodeID(vscode_id);
	return variables;
}

async function evaluateRequest(scope: VariableScope, expression: string, context = "watch", frameId = 0): Promise<any> {
	// corresponds to file://./debug_session.ts protected async evaluateRequest
	const evaluateResponse: DebugProtocol.EvaluateResponse = await vscode.debug.activeDebugSession?.customRequest(
		"evaluate",
		{
			context,
			expression,
			frameId,
		},
	);
	return evaluateResponse.body;
}

function formatMs(ms: number): string {
	const seconds = Math.floor((ms / 1000) % 60);
	const minutes = Math.floor((ms / (1000 * 60)) % 60);
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${(Math.round(ms) % 1000).toString().padStart(3, "0")}`;
}

function formatMessage(this: Mocha.Context, msg: string): string {
	return `[${formatMs(performance.now() - this.testStart)}] ${msg}`;
}

var fmt: (msg: string) => string; // formatMessage bound to Mocha.Context

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Chai {
		interface Assertion {
			unique: Assertion;
		}
	}
}

chai.Assertion.addProperty("unique", function () {
	const actual = this._obj; // The object being tested
	if (!Array.isArray(actual)) {
		throw new chai.AssertionError("Expected value to be an array");
	}
	const uniqueArray = [...new Set(actual)];
	this.assert(
		actual.length === uniqueArray.length,
		"expected #{this} to contain only unique elements",
		"expected #{this} to not contain only unique elements",
		uniqueArray,
		actual,
	);
});

async function startDebugging(
	scene: "ScopeVars.tscn" | "ExtensiveVars.tscn" | "BuiltInTypes.tscn" = "ScopeVars.tscn",
): Promise<void> {
	const t0 = performance.now();
	const debugConfig: vscode.DebugConfiguration = {
		type: "godot",
		request: "launch",
		name: "Godot Debug",
		scene: scene,
		additional_options: "--headless",
	};
	console.log(fmt(`Starting debugger for scene ${scene}`));
	const res = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], debugConfig);
	const t1 = performance.now();
	console.log(fmt(`Starting debugger for scene ${scene} completed, took ${t1 - t0}ms`));
	if (!res) {
		throw new Error(`Failed to start debugging for scene ${scene}`);
	}
}

suite("DAP Integration Tests - Variable Scopes", () => {
	// workspaceFolder should match `.vscode-test.js`::workspaceFolder
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!workspaceFolder || !workspaceFolder.endsWith("test-dap-project-godot4")) {
		throw new Error(`workspaceFolder should contain 'test-dap-project-godot4' project, got: ${workspaceFolder}`);
	}

	suiteSetup(async function () {
		this.timeout(20000); // enough time to do `godot --import`
		console.log("Environment Variables:");
		for (const [key, value] of Object.entries(process.env)) {
			console.log(`${key}: ${value}`);
		}

		// init the godot project by importing it in godot engine:
		const config = vscode.workspace.getConfiguration("godotTools");
		// config.update("editorPath.godot4", "godot4", vscode.ConfigurationTarget.Workspace);
		var godot4_path = clean_godot_path(config.get<string>("editorPath.godot4"));
		// get the path for currently opened project in vscode test instance:
		console.log("Executing", [godot4_path, "--headless", "--import", workspaceFolder]);
		const exec_res = await execFileAsync(godot4_path, ["--headless", "--import", workspaceFolder], {
			shell: true,
			cwd: workspaceFolder,
		});
		if (exec_res.stderr !== "") {
			throw new Error(exec_res.stderr);
		}
		console.log(exec_res.stdout);
	});

	setup(async function () {
		console.log(`➤ Test '${this?.currentTest.title}' starting`);
		await vscode.commands.executeCommand("workbench.action.closeAllEditors");
		if (vscode.debug.breakpoints) {
			await vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
		}
		this.testStart = performance.now();
		fmt = formatMessage.bind(this);
	});

	teardown(async function () {
		this.timeout(3000);
		await sleep(1000);
		if (vscode.debug.activeDebugSession !== undefined) {
			console.log("Closing debug session");
			await vscode.debug.stopDebugging();
			await sleep(1000);
		}
		console.log(
			`⬛ Test '${this.currentTest.title}' result: ${this.currentTest.state}, duration: ${performance.now() - this.testStart}ms`,
		);
	});

	// test("sample test", async function() {
	//   expect(true).to.equal(true);
	//   expect([1,2,3]).to.be.unique;
	//   expect([1,1]).not.to.be.unique;
	// });

	test("should return correct scopes", async function () {
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
		const breakpoint = new vscode.SourceBreakpoint(
			breakpointLocations["breakpoint::ScopeVars::ClassFoo::test_function"],
		);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("ScopeVars.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		// corresponds to file://./debug_session.ts async scopesRequest
		const stack_scopes_map: Map<
			number,
			{
				Locals: number;
				Members: number;
				Globals: number;
			}
		> = new Map();
		for (var stack_frame_id = 0; stack_frame_id < 3; stack_frame_id++) {
			const res_scopes = await vscode.debug.activeDebugSession.customRequest("scopes", {
				frameId: stack_frame_id,
			});
			expect(res_scopes).to.exist;
			expect(res_scopes.scopes).to.exist;
			expect(res_scopes.scopes.length).to.equal(3, "Expected 3 scopes");
			expect(res_scopes.scopes[0].name).to.equal(VariableScope[VariableScope.Locals], "Expected Locals scope");
			expect(res_scopes.scopes[1].name).to.equal(VariableScope[VariableScope.Members], "Expected Members scope");
			expect(res_scopes.scopes[2].name).to.equal(VariableScope[VariableScope.Globals], "Expected Globals scope");
			const vscode_ids = res_scopes.scopes.map((s) => s.variablesReference);
			expect(vscode_ids, "VSCode IDs should be unique for each scope").to.be.unique;
			stack_scopes_map[stack_frame_id] = {
				Locals: vscode_ids[0],
				Members: vscode_ids[1],
				Globals: vscode_ids[2],
			};
		}

		const all_scopes_vscode_ids = Array.from(stack_scopes_map.values()).flatMap((s) => Object.values(s));
		expect(all_scopes_vscode_ids, "All scopes should be unique").to.be.unique;

		const vars_frame0_locals = await getVariablesForVSCodeID(stack_scopes_map[0].Locals);
		expect(vars_frame0_locals).to.containSubset([
			{ name: "str_var", value: "ScopeVars::ClassFoo::test_function::local::str_var" },
		]);

		const vars_frame1_locals = await getVariablesForVSCodeID(stack_scopes_map[1].Locals);
		expect(vars_frame1_locals).to.containSubset([{ name: "str_var", value: "ScopeVars::test::local::str_var" }]);

		const vars_frame2_locals = await getVariablesForVSCodeID(stack_scopes_map[2].Locals);
		expect(vars_frame2_locals).to.containSubset([{ name: "str_var", value: "ScopeVars::_ready::local::str_var" }]);
	})?.timeout(10000);

	test("should return global variables", async function () {
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("ScopeVars.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		const variables = await getVariablesForScope(VariableScope.Globals);
		expect(variables).to.containSubset([{ name: "GlobalScript" }]);
	})?.timeout(10000);

	test("should return all local variables", async function () {
		/** {@link file://./../../../../test_projects/test-dap-project-godot4/ScopeVars.gd"} */
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("ScopeVars.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		const variables = await getVariablesForScope(VariableScope.Locals);
		expect(variables.length).to.equal(2);
		expect(variables).to.containSubset([{ name: "str_var" }]);
		expect(variables).to.containSubset([{ name: "self_var" }]);
	})?.timeout(10000);

	test("should return all member variables", async function () {
		/** {@link file://./../../../../test_projects/test-dap-project-godot4/ScopeVars.gd"} */
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("ScopeVars.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		const variables = await getVariablesForScope(VariableScope.Members);
		expect(variables.length).to.equal(4);
		expect(variables).to.containSubset([{ name: "self" }]);
		expect(variables).to.containSubset([{ name: "member1" }]);
		expect(variables).to.containSubset([{ name: "str_var", value: "ScopeVars::member::str_var" }]);
		expect(variables).to.containSubset([
			{ name: "str_var_member_only", value: "ScopeVars::member::str_var_member_only" },
		]);
	})?.timeout(10000);

	test("should retrieve all built-in types correctly", async function () {
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "BuiltInTypes.gd"));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::BuiltInTypes::_ready"]);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("BuiltInTypes.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		const variables = await getVariablesForScope(VariableScope.Locals);

		expect(variables).to.containSubset([{ name: "int_var", value: "42" }]);
		expect(variables).to.containSubset([{ name: "float_var", value: "3.14" }]);
		expect(variables).to.containSubset([{ name: "bool_var", value: "true" }]);
		expect(variables).to.containSubset([{ name: "string_var", value: "Hello, Godot!" }]);
		expect(variables).to.containSubset([{ name: "nil_var", value: "null" }]);
		expect(variables).to.containSubset([{ name: "vector2", value: "Vector2(10, 20)" }]);
		expect(variables).to.containSubset([{ name: "vector3", value: "Vector3(1, 2, 3)" }]);
		expect(variables).to.containSubset([{ name: "rect2", value: "Rect2((0, 0) - (100, 50))" }]);
		expect(variables).to.containSubset([{ name: "quaternion", value: "Quat(0, 0, 0, 1)" }]);
		expect(variables).to.containSubset([{ name: "simple_array", value: "(3) [1, 2, 3]" }]);
		// expect(variables).to.containSubset([{ name: "nested_dict.nested_key", value: `"Nested Value"` }]);
		// expect(variables).to.containSubset([{ name: "nested_dict.sub_dict.sub_key", value: "99" }]);
		expect(variables).to.containSubset([{ name: "nested_dict", value: "Dictionary(2)" }]);
		expect(variables).to.containSubset([{ name: "byte_array", value: "(4) [0, 1, 2, 255]" }]);
		expect(variables).to.containSubset([{ name: "int32_array", value: "(3) [100, 200, 300]" }]);
		expect(variables).to.containSubset([{ name: "color_var", value: "Color(1, 0, 0, 1)" }]);
		expect(variables).to.containSubset([{ name: "aabb_var", value: "AABB((0, 0, 0), (1, 1, 1))" }]);
		expect(variables).to.containSubset([{ name: "plane_var", value: "Plane(0, 1, 0, -5)" }]);
		expect(variables).to.containSubset([{ name: "callable_var", value: "Callable()" }]);
		expect(variables).to.containSubset([{ name: "signal_var" }]);
		const signal_var = variables.find((v) => v.name === "signal_var");
		expect(signal_var.value).to.match(
			/Signal\(member_signal\, <\d+>\)/,
			"Should be in format of 'Signal(member_signal, <28236055815>)'",
		);
	})?.timeout(10000);

	test("should retrieve all complex variables correctly", async function () {
		const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ExtensiveVars.gd"));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ExtensiveVars::_ready"]);
		vscode.debug.addBreakpoints([breakpoint]);

		await startDebugging("ExtensiveVars.tscn");
		await waitForBreakpoint(breakpoint, 2000);

		// TODO: current DAP needs a delay before it will return variables
		console.log("Sleeping for 2 seconds");
		await sleep(2000);

		const memberVariables = await getVariablesForScope(VariableScope.Members);

		expect(memberVariables.length).to.equal(3, "Incorrect member variables count");
		expect(memberVariables).to.containSubset([{ name: "self" }]);
		expect(memberVariables).to.containSubset([{ name: "self_var" }]);
		expect(memberVariables).to.containSubset([{ name: "label" }]);
		const self = memberVariables.find((v) => v.name === "self");
		const self_var = memberVariables.find((v) => v.name === "self_var");
		expect(self.value).to.deep.equal(self_var.value);

		const localVariables = await getVariablesForScope(VariableScope.Locals);
		const expectedLocalVariables = [
			{ name: "local_label", value: /Label<\d+>/ },
			{ name: "local_self_var_through_label", value: /Node2D<\d+>/ },
			{ name: "local_classA", value: /RefCounted<\d+>/ },
			{ name: "local_classB", value: /RefCounted<\d+>/ },
			{ name: "str_var", value: /^ExtensiveVars::_ready::local::str_var$/ },
		];
		expect(localVariables.length).to.equal(expectedLocalVariables.length, "Incorrect local variables count");
		expect(localVariables).to.containSubset(expectedLocalVariables.map((v) => ({ name: v.name })));
		for (const expectedLocalVariable of expectedLocalVariables) {
			const localVariable = localVariables.find((v) => v.name === expectedLocalVariable.name);
			expect(localVariable).to.exist;
			expect(localVariable.value).to.match(
				expectedLocalVariable.value,
				`Variable '${expectedLocalVariable.name}' has incorrect value'`,
			);
		}
	})?.timeout(15000);
});

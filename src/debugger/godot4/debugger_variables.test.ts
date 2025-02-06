import { promises as fs } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DebugProtocol } from "@vscode/debugprotocol";
import chai from "chai";
import chaiSubset from "chai-subset";

chai.use(chaiSubset);
const { expect } = chai;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve,  ms));
}

/**
 * Given a path to a script, returns an object where each key is the name of a
 * breakpoint (delimited by `breakpoint::`) and each value is the line number
 * where the breakpoint appears in the script.
 *
 * @param scriptPath The path to the script to scan.
 * @returns An object of breakpoint names to line numbers.
 */
async function getBreakpointLocations(scriptPath: string) {
  const script_content = await fs.readFile(scriptPath, "utf-8");
  const breakpoints: { [key: string]: vscode.Location } = {};
  const breakpointRegex = /\b(breakpoint::.*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = breakpointRegex.exec(script_content)) !== null) {
    const breakpointName = match[1];
    const line = match.index ? script_content.substring(0, match.index).split("\n").length : 1;
    breakpoints[breakpointName] = new vscode.Location(vscode.Uri.file(scriptPath), new vscode.Position(line - 1, 0));
  }
  return breakpoints;
}

async function waitForActiveStackItemChange(ms: number = 10000): Promise<vscode.DebugThread | vscode.DebugStackFrame | undefined> {
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

async function waitForBreakpoint(breakpoint?: vscode.SourceBreakpoint, ms?: number): Promise<void> {
  const res = await waitForActiveStackItemChange(ms);
  const stackFrames = await getStackFrames();
  if (stackFrames[0].source.path !== breakpoint.location.uri.fsPath || stackFrames[0].line != breakpoint.location.range.start.line+1) {
    throw new Error(`Wrong breakpoint was hit. Expected: ${breakpoint.location.uri.fsPath}:${breakpoint.location.range.start.line+1}, Got: ${stackFrames[0].source.path}:${stackFrames[0].line}`);
  }
}

enum VariableScope {
  Locals  = 1,
  Members = 2,
  Globals = 3
}

async function getVariablesForScope(scope: VariableScope): Promise<DebugProtocol.Variable[]> {
  // corresponds to file://./debug_session.ts protected async variablesRequest
  const variablesResponse = await vscode.debug.activeDebugSession?.customRequest("variables", {
    variablesReference: scope
  });
  return variablesResponse?.variables || [];
}

async function evaluateRequest(scope: VariableScope, expression: string, context = "watch", frameId = 0): Promise<any> {
  // corresponds to file://./debug_session.ts protected async evaluateRequest
  const evaluateResponse: DebugProtocol.EvaluateResponse = await vscode.debug.activeDebugSession?.customRequest("evaluate", {
    context,
    expression,
    frameId
  });
  return evaluateResponse.body;
}

async function startDebugging(scene: "ScopeVars.tscn" | "ExtensiveVars.tscn" | "BuiltInTypes.tscn" = "ScopeVars.tscn"): Promise<void> {
  const debugConfig: vscode.DebugConfiguration = {
    type: "godot",
    request: "launch",
    name: "Godot Debug",
    scene: scene,
    additional_options: "--headless"
  };
  const res = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], debugConfig);
  if (!res) {
    throw new Error("Failed to start debugging");
  }
}

suite("DAP Integration Tests - Variable Scopes", () => {
  // workspaceFolder should match `.vscode-test.js`::workspaceFolder
  const workspaceFolder = path.resolve(__dirname, "../../../test_projects/test-dap-project-godot4");

  suiteSetup(() => {
    console.log("Environment Variables:");
    for (const [key, value] of Object.entries(process.env)) {
      console.log(`${key}: ${value}`);
    }
  });

  setup(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    if (vscode.debug.breakpoints) {
      await vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
    }
  });


  teardown(async () => {
    await sleep(1000);
    if (vscode.debug.activeDebugSession !== undefined) {
      console.log("Closing debug session");
      await vscode.debug.stopDebugging();
    }
  });
  
  test("should return correct scopes", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("ScopeVars.tscn");
    await waitForBreakpoint(breakpoint, 2000);

    // corresponds to file://./debug_session.ts async scopesRequest
    const res_scopes = await vscode.debug.activeDebugSession.customRequest("scopes", {frameId: 1});

    expect(res_scopes).to.exist;
    expect(res_scopes.scopes).to.exist;

    const scopes = res_scopes.scopes;
    expect(scopes.length).to.equal(3, "Expected 3 scopes");
    expect(scopes[0].name).to.equal(VariableScope[VariableScope.Locals], "Expected Locals scope");
    expect(scopes[0].variablesReference).to.equal(VariableScope.Locals, "Expected Locals variablesReference");
    expect(scopes[1].name).to.equal(VariableScope[VariableScope.Members], "Expected Members scope");
    expect(scopes[1].variablesReference).to.equal(VariableScope.Members, "Expected Members variablesReference");
    expect(scopes[2].name).to.equal(VariableScope[VariableScope.Globals], "Expected Globals scope");
    expect(scopes[2].variablesReference).to.equal(VariableScope.Globals, "Expected Globals variablesReference");

    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(5000);

  test("should return global variables", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("ScopeVars.tscn");
    await waitForBreakpoint(breakpoint);
    
    // TODO: current DAP needs a delay before it will return variables
    console.log("Sleeping for 2 seconds");
    await sleep(2000);

    const variables = await getVariablesForScope(VariableScope.Globals);
    expect(variables).to.containSubset([{name: "GlobalScript"}]);
    
    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(7000);

  test("should return local variables", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("ScopeVars.tscn");
    await waitForBreakpoint(breakpoint);

    // TODO: current DAP needs a delay before it will return variables
    console.log("Sleeping for 2 seconds");
    await sleep(2000);

    const variables = await getVariablesForScope(VariableScope.Locals);
    expect(variables.length).to.equal(2);
    expect(variables).to.containSubset([{name: "local1"}]);
    expect(variables).to.containSubset([{name: "local2"}]);
    
    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(5000);

  test("should return member variables", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ScopeVars.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ScopeVars::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("ScopeVars.tscn");
    await waitForBreakpoint(breakpoint);

    // TODO: current DAP needs a delay before it will return variables
    console.log("Sleeping for 2 seconds");
    await sleep(2000);

    const variables = await getVariablesForScope(VariableScope.Members);
    expect(variables.length).to.equal(2);
    expect(variables).to.containSubset([{name: "self"}]);
    expect(variables).to.containSubset([{name: "member1"}]);

    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(5000);

  test("should retrieve all built-in types correctly", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "BuiltInTypes.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::BuiltInTypes::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("BuiltInTypes.tscn");
    await waitForBreakpoint(breakpoint);
    
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
    // expect(variables).to.containSubset([{ name: "simple_array", value: "[1, 2, 3]" }]);
    expect(variables).to.containSubset([{ name: "simple_array", value: "Array[3]" }]);
    // expect(variables).to.containSubset([{ name: "nested_dict.nested_key", value: `"Nested Value"` }]);
    // expect(variables).to.containSubset([{ name: "nested_dict.sub_dict.sub_key", value: "99" }]);
    expect(variables).to.containSubset([{ name: "nested_dict", value: "Dictionary[2]" }]);
    // expect(variables).to.containSubset([{ name: "byte_array", value: "[0, 1, 2, 255]" }]);
    expect(variables).to.containSubset([{ name: "byte_array", value: "Array[4]" }]);
    // expect(variables).to.containSubset([{ name: "int32_array", value: "[100, 200, 300]" }]);
    expect(variables).to.containSubset([{ name: "int32_array", value: "Array[3]" }]);
    expect(variables).to.containSubset([{ name: "color_var", value: "Color(1, 0, 0, 1)" }]);
    expect(variables).to.containSubset([{ name: "aabb_var", value: "AABB((0, 0, 0), (1, 1, 1))" }]);
    expect(variables).to.containSubset([{ name: "plane_var", value: "Plane(0, 1, 0, -5)" }]);
    expect(variables).to.containSubset([{ name: "callable_var", value: "Callable()" }]);
    expect(variables).to.containSubset([{ name: "signal_var" }]);
    const signal_var = variables.find(v => v.name === "signal_var");
    expect(signal_var.value).to.match(/Signal\(member_signal\, <\d+>\)/, "Should be in format of 'Signal(member_signal, <28236055815>)'");
  
    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(5000);

  test("should retrieve all complex variables correctly", async () => {
    const breakpointLocations = await getBreakpointLocations(path.join(workspaceFolder, "ExtensiveVars.gd"));
    const breakpoint = new vscode.SourceBreakpoint(breakpointLocations["breakpoint::ExtensiveVars::_ready"]);
    vscode.debug.addBreakpoints([breakpoint]);

    await startDebugging("ExtensiveVars.tscn");
    await waitForBreakpoint(breakpoint);

    // TODO: current DAP needs a delay before it will return variables
    console.log("Sleeping for 2 seconds");
    await sleep(2000);

    const memberVariables = await getVariablesForScope(VariableScope.Members);
    
    expect(memberVariables.length).to.equal(3);
    expect(memberVariables).to.containSubset([{name: "self"}]);
    expect(memberVariables).to.containSubset([{name: "self_var"}]);
    const self = memberVariables.find(v => v.name === "self");
    const self_var = memberVariables.find(v => v.name === "self_var");
    expect(self.value).to.deep.equal(self_var.value);
    
    const localVariables = await getVariablesForScope(VariableScope.Locals);
    expect(localVariables.length).to.equal(4);
    expect(localVariables).to.containSubset([
      { name: "local_label", value: "Label" },
      { name: "local_self_var_through_label", value: "Node2D" },
      { name: "local_classA", value: "RefCounted" },
      { name: "local_classB", value: "RefCounted" }
    ]);
    
    await sleep(1000);
    await vscode.debug.stopDebugging();
  })?.timeout(15000);
});

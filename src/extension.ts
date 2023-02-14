import { ExtensionContext } from "vscode";
import { GodotTools } from "./godot-tools";
import debuggerContextv3 = require("./debugger/godot3/debugger_context");
import debuggerContextv4 = require("./debugger/godot4/debugger_context");

let tools: GodotTools = null;

export function activate(context: ExtensionContext) {
	tools = new GodotTools(context);
	tools.activate();
	debuggerContextv3.register_debugger(context);
	debuggerContextv4.register_debugger(context);
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		tools.deactivate();
		resolve();
	});
}

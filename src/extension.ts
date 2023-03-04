import { ExtensionContext } from "vscode";
import { GodotTools } from "./godot-tools";
import * as debuggerContextv3 from "./debugger/godot3/debugger_context";
import * as debuggerContextv4 from "./debugger/godot4/debugger_context";
import { get_godot_version } from "./utils";

let tools: GodotTools = null;

export async function activate(context: ExtensionContext) {
	tools = new GodotTools(context);
	tools.activate();
	const godot_version = await get_godot_version();
	if (godot_version === 4) {
		debuggerContextv4.register_debugger(context);
	} else {
		debuggerContextv3.register_debugger(context);
	}
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		tools.deactivate();
		resolve();
	});
}

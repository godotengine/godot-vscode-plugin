'use strict';
import { workspace, Disposable, ExtensionContext } from 'vscode';
import WindowWatch from "./window_watcher";
import ToolManager from './tool_manager';

let tool: ToolManager = null;

export function activate(context: ExtensionContext) {
	tool = new ToolManager(context);
	// context.subscriptions.push(tool);
	context.subscriptions.push(new WindowWatch());
	console.log("[GodotTools]: Extension Activated");
}

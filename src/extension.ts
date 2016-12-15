'use strict';

import { workspace, Disposable, ExtensionContext } from 'vscode';
import * as vscode from "vscode";
import WindowWatch from "./window_watcher";

export function activate(context: ExtensionContext) {
	context.subscriptions.push(new WindowWatch());
	console.log("[GodotTools]: Extension Activated");
}

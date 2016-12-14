'use strict';

import * as path from 'path';
import GDScriptClient from './gdscript/client';
import { workspace, Disposable, ExtensionContext } from 'vscode';
import * as vscode from "vscode";

import { LanguageClient } from 'vscode-languageclient';
let gdclient: GDScriptClient = null;

export function activate(context: ExtensionContext) {
	gdclient = new GDScriptClient(context);
	let disposable = gdclient.createLanguageClient().start();
	context.subscriptions.push(disposable);
}

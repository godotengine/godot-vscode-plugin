'use strict';

import * as path from 'path';
import GDScriptClient from './gdscript/client';
import { workspace, Disposable, ExtensionContext } from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
let gdscript_client = null;

export function activate(context: ExtensionContext) {

	gdscript_client = new GDScriptClient(context);
	
	// Create the language client and start the client.
	let disposable = new LanguageClient('GDScriptLanguage', gdscript_client.server_options, gdscript_client.client_options).start();
	context.subscriptions.push(disposable);
}

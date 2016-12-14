'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind
} from 'vscode-languageserver';

import request from "./request";
import validate from "./actions/gd_validate";
import CodeCompleter from './actions/gd_codecomplete';

let completer: CodeCompleter = null;

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager supports full document sync only
let documents: TextDocuments = new TextDocuments();

// Make the text document manager listen on the connection for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	completer = new CodeCompleter();
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: [ '.', 'a', 'b', 'c', 'd', 'e', 'f', 'g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','(',
					'_', 'A', 'B', 'C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','\'','\"'
				]
			}
		}
	}
});
let doc = null;

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	doc = change.document;
	validateTextDocument(doc);
});

// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		let cursor = {row: textDocumentPosition.position.line+1, column:textDocumentPosition.position.character};
		let items = [...completer.getItems()];
		completer.query(doc.getText(), doc.uri, cursor);
		return items;
});

// The settings interface describe the server relevant settings part
interface Settings {
	GDScriptServer: ExampleSettings;
	
}

// These are the example settings we defined in the client's package.json
// file
interface ExampleSettings {
	maxNumberOfProblems: number;
	editorServerPort: number;
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
let editorServerPort: number;

// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.GDScriptServer.maxNumberOfProblems || 10;
	// editorServerPort: settings.GDScriptServer.editorServerPort || 6996;
	documents.all().forEach(validateTextDocument);
});

function validateTextDocument(textDocument: TextDocument): void {
	validate(textDocument.getText(), textDocument.uri, connection);
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have change in VSCode
	connection.console.log('We recevied an file change event');
});


// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	// if (item.data === 1) {
	// 	item.detail = 'TypeScript details',
	// 	item.documentation = 'TypeScript documentation'
	// } else if (item.data === 2) {
	// 	item.detail = 'JavaScript details',
	// 	item.documentation = 'JavaScript documentation'
	// }
	return item;
});


// connection.onDidOpenTextDocument((params) => {
// 	// A text document got opened in VSCode.
// 	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
// 	// params.text the initial full content of the document.
// 	connection.console.log(`${params.uri} opened.`);
// });

// connection.onDidChangeTextDocument((params) => {
// 	// The content of a text document did change in VSCode.
// 	// params.uri uniquely identifies the document.
// 	// params.contentChanges describe the content changes to the document.
// 	params.contentChanges
// 	connection.console.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
// });

// connection.onDidCloseTextDocument((params) => {
// 	// A text document got closed in VSCode.
// 	// params.uri uniquely identifies the document.
// 	connection.console.log(`${params.uri} closed.`);
// });


// Listen on the connection
connection.listen();
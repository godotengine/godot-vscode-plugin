import * as path from "path";
import * as fs from "fs"
import * as vscode from 'vscode'
import * as extension from "../extension"
import { MessageIO, MessageIOReader, MessageIOWriter } from "../lsp/MessageIO";
import { LanguageClient, LanguageClientOptions, ServerOptions, RequestMessage, NotificationMessage } from "vscode-languageclient";
import { ResponseMessage, isRequestMessage } from "vscode-jsonrpc/lib/messages";
type Message = RequestMessage | ResponseMessage | NotificationMessage;

export default class BuiltinDocHelper {

	public io: MessageIO;
	public docItems: vscode.QuickPickItem[] = [];
	public builtins = new Set();
	public dataDirectory: string;
	public isActivated: boolean = false;

	private showDocItemSelector: boolean = true;
	private wasDefinitionRequest : boolean = false;

	constructor(io: MessageIO) {
		this.io = io;
		this.io.on('message', this.on_message.bind(this));
		this.io.on('send_message', this.on_send_message.bind(this));
	}

	public activate(data_path: string) {
		this.dataDirectory = path.join(data_path, 'godot', 'doc');
		let indexLocation = path.join(data_path, 'godot', 'doc', `index.json`);

		if (fs.existsSync(indexLocation)) {
			let data = fs.readFileSync(indexLocation, 'utf8');
			if (data) {
				var index = JSON.parse(data);
				for (let i = 0; i < index.size; i++) {
					this.docItems.push({
						label: index.contents[i].label,
						description: index.contents[i].detail
					});
				}
				for (let i = 0; i < index.builtinSize; i++) {
					this.builtins.add(index.builtin[i]);
				}
				this.isActivated = true;
			}
		}
	}

	public show_doc(showDocItemSelector: boolean = true) {
		let symbolName = vscode.window.activeTextEditor ? this.scan_document(vscode.window.activeTextEditor) : null;
		this.showDocItemSelector = showDocItemSelector;

		if (symbolName == null) {
			if (this.showDocItemSelector) {
				this.show_doc_items();
			}
		} else if (vscode.window.activeTextEditor &&
			vscode.window.activeTextEditor.document &&
			(
				vscode.window.activeTextEditor.document.languageId === 'gdscript'
			)) {
			this.find_doc(symbolName);
		}
	}

	public parse_to_symbol(text: string, pos: number) {
		let moduleName = null;

		let re = / \b[a-zA-Z]\w*/g;
		let str = text;
		let matched;
		while ((matched = re.exec(str)) != null) {
			if (matched.index <= pos && pos <= re.lastIndex) {
				moduleName = matched[0];
				break;
			}
		}

		return moduleName;
	}

	private show_doc_items() {
		if (!this.showDocItemSelector) {
			return;
		}

		vscode.window.showQuickPick(this.docItems).then(selection => {
			if (!selection) {
				return;
			}

			this.find_doc(selection.label);
		});
	}

	private scan_document(textEditor: vscode.TextEditor) {
		const textDocument = textEditor.document;

		let pos = textEditor.selection.start;
		let line = textDocument.lineAt(pos.line);
		const symbolName = this.parse_to_symbol(line.text, pos.character);

		if (symbolName) return symbolName;
		return null;
	}

	private find_doc(symbolName: string, textEditor?: vscode.TextEditor) {
		textEditor = textEditor || vscode.window.activeTextEditor;

		if (!textEditor.document) {
			throw new Error('No open document');
		}

		if (this.dataDirectory) {
			symbolName = symbolName.replace(' ', '');
			let docPath = path.join(this.dataDirectory, `${symbolName}.md`);
			if (fs.existsSync(docPath)) {
				let docUri = vscode.Uri.file(docPath);
				return vscode.commands.executeCommand('markdown.showPreviewToSide', docUri);
			} else if (this.builtins.has(symbolName)) {
				let docUri = vscode.Uri.file(path.join(this.dataDirectory, `@GDScript.md`));
				return vscode.commands.executeCommand('markdown.showPreviewToSide', docUri);
			} else {
				if (this.showDocItemSelector) {
					this.show_doc_items();
				}
			}
		}
	}

	private on_send_message(message: Message) {
		if (message && message["params"]["position"]) {
			let pos = vscode.window.activeTextEditor.selection.start;
			this.wasDefinitionRequest = (message["method"] == 'textDocument/definition' &&
				message["params"]["position"]["line"] == pos.line && message["params"]["position"]["character"] == pos.character);
		}
	}

	private on_message(message: Message) {
		if (message && message["result"] && message["result"]["capabilities"]) {
			let dataDirectory = message["result"]["capabilities"]["dataDirectory"];
			if (dataDirectory) {
				this.activate(dataDirectory);
			}
		}

		// If it was a definition request and there's no result (LSP server couldn't resolve it)
		if (this.wasDefinitionRequest && message["result"] && !message["result"][0]) {
			this.show_doc(false);
		}
	}
};

import * as vscode from 'vscode';
import { EventEmitter } from "events";
import { MessageIO } from "./MessageIO";
import { NotificationMessage } from "vscode-jsonrpc";
import { DocumentSymbol } from "vscode";
const METHOD_ID = 'gdscript/show_native_symbol';

class GodotNativeSymbol extends DocumentSymbol {
	documentation: string;
	native_class: string;
};

export default class NativeDocumentManager extends EventEmitter {
		
	constructor(io: MessageIO) {
		super();
		io.on("message", (message: NotificationMessage)=>{
			if (message.method == METHOD_ID) {
				this.show_native_symbol(message.params);
			}
		});
	}

	
	private show_native_symbol(symbol: GodotNativeSymbol) {
		// 创建webview
		const panel = vscode.window.createWebviewPanel(
			'doc',
			symbol.name,
			vscode.ViewColumn.Nine,
			{
				enableScripts: false, // 启用JS，默认禁用
				retainContextWhenHidden: false, // webview被隐藏时保持状态，避免被重置
			}
		);
		panel.title = symbol.name;
		panel.webview.html = this.make_html_content(symbol);
	}
	
	private make_html_content(symbol: GodotNativeSymbol): string {
		return `<html><body>${this.make_symbol_document(symbol)}</body></html>`;
	}
	
	private make_symbol_document(symbol: GodotNativeSymbol): string {
		let doc = '';
		function line(text: string) {
			doc += text + '\n';
		};
		
		switch (symbol.kind) {
			case vscode.SymbolKind.Class: {
				line(`<h1>${symbol.detail}</h1>`);
				line(`<h3>Description</h3>`)
				line(`<p>${this.parse_markdown(symbol.documentation)}</p>`);
			} break;
			default:
				break;
		}
		return doc;
	}
	
	private parse_markdown(markdown: string): string {
		return markdown;
	}
}

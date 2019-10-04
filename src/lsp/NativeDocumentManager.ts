import * as vscode from 'vscode';
import { EventEmitter } from "events";
import { MessageIO } from "./MessageIO";
import { NotificationMessage } from "vscode-jsonrpc";
import { DocumentSymbol } from "vscode";

const enum Methods {
	SHOW_NATIVE_SYMBOL = 'gdscript/show_native_symbol',
	INSPECT_NATIVE_SYMBOL = 'textDocument/nativeSymbol'
}

interface NativeSymbolInspectParams {
	native_class: string;
	symbol_name: string;
}

const enum WebViewMessageType {
	INSPECT_NATIVE_SYMBOL = 'INSPECT_NATIVE_SYMBOL',
};

class GodotNativeSymbol extends DocumentSymbol {
	documentation: string;
	native_class: string;
};

export default class NativeDocumentManager extends EventEmitter {
	
	private io: MessageIO = null;
	
	constructor(io: MessageIO) {
		super();
		this.io = io;
		io.on("message", (message: NotificationMessage)=>{
			if (message.method == Methods.SHOW_NATIVE_SYMBOL) {
				this.show_native_symbol(message.params);
			}
		});
	}
	
	private inspect_native_symbol(params: NativeSymbolInspectParams) {
		this.io.send_message(JSON.stringify({
			id: -1,
			jsonrpc: "2.0",
			method: Methods.INSPECT_NATIVE_SYMBOL,
			params
		}));
	}

	
	private show_native_symbol(symbol: GodotNativeSymbol) {
		// 创建webview
		const panel = vscode.window.createWebviewPanel(
			'doc',
			symbol.name,
			vscode.ViewColumn.Nine,
			{
				enableScripts: true, // 启用JS，默认禁用
				retainContextWhenHidden: false, // webview被隐藏时保持状态，避免被重置
			}
		);
		panel.title = symbol.name;
		panel.webview.html = this.make_html_content(symbol);
		panel.webview.onDidReceiveMessage(this.on_webview_message.bind(this));
	}
	
	private on_webview_message(msg: any) {
		switch (msg.type) {
			case WebViewMessageType.INSPECT_NATIVE_SYMBOL:
				this.inspect_native_symbol(msg.data);
				break;
			default:
				break;
		}
	}
	
	private make_html_content(symbol: GodotNativeSymbol): string {
		return `
		<html>
			<body>${this.make_symbol_document(symbol)}</body>
			<script>
				var vscode = acquireVsCodeApi();
				function inspect(native_class, symbol_name) {
					vscode.postMessage({
						type: '${WebViewMessageType.INSPECT_NATIVE_SYMBOL}',
						data: {
							native_class: native_class,
							symbol_name: symbol_name
						}
					});
				};
			</script>
		</html>`;
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
				line(`<a onclick="inspect('Control', 'rect_position')">Control.rect_position</a>`);
			} break;
			default:
				line(`<h1>${symbol.detail}</h1>`);
				line(`<p>${this.parse_markdown(symbol.documentation)}</p>`);
				break;
		}
		return doc;
	}
	
	private parse_markdown(markdown: string): string {
		return markdown;
	}
}

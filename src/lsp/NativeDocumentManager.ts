import * as vscode from "vscode";
import {
	CancellationToken,
	CustomDocument,
	CustomDocumentOpenContext,
	CustomReadonlyEditorProvider,
	ExtensionContext,
	Uri,
	ViewColumn,
	WebviewPanel,
} from "vscode";
import { NotificationMessage } from "vscode-jsonrpc";
import { ResponseMessage } from "vscode-languageclient";
import { MessageIO } from "./MessageIO";
import { get_configuration, createLogger } from "../utils";
import {
	Methods,
	NativeSymbolInspectParams,
	GodotNativeSymbol,
	GodotNativeClassInfo,
	GodotCapabilities,
} from "./gdscript.capabilities";
import { make_html_content } from "./native_document_builder";

const log = createLogger("docs");

export class NativeDocumentManager implements CustomReadonlyEditorProvider {
	public classInfo: { [key: string]: GodotNativeClassInfo } = {};
	public symbolDb: { [key: string]: GodotNativeSymbol } = {};

	private messageCount = -1;
	private pendingInspections: Map<number, string> = new Map();
	private webViews: Map<string, WebviewPanel> = new Map();

	constructor(private io: MessageIO, context: ExtensionContext) {
		io.on("message", this.on_message.bind(this));
		const options = {
			webviewOptions: {
				enableScripts: true,
				retainContextWhenHidden: true,
				enableFindWidget: true,
			},
			supportsMultipleEditorsPerDocument: true,
		};
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider("gddoc", this, options),
		);
	}

	public openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): CustomDocument {
		return { uri: uri, dispose: () => { } };
	}

	public resolveCustomEditor(document: CustomDocument, webviewPanel: WebviewPanel, token: CancellationToken): void {
		let symbol = document.uri.path.split(".")[0];
		if (document.uri.fragment) {
			symbol += `.${document.uri.fragment}`;
		}

		webviewPanel.webview.options = {
			enableScripts: true,
		};
		this.webViews.set(symbol, webviewPanel);
		this.request_documentation(symbol);
	}

	public request_documentation(symbolName: string) {
		let target: string | undefined = undefined;
		if (symbolName.includes(".")) {
			const parts = symbolName.split(".");
			symbolName = parts[0];
			target = parts[1];
		}

		if (symbolName in this.symbolDb) {
			log.debug("Found symbol in db", symbolName);
			this.show_native_symbol(this.symbolDb[symbolName], target);
			return;
		}

		if (symbolName in this.classInfo) {
			const id = this.inspect_native_symbol({
				native_class: symbolName,
				symbol_name: symbolName,
			});
			this.pendingInspections.set(id, target);
			return;
		}
	}

	public async list_native_classes() {
		const classname = await vscode.window.showQuickPick(
			Object.keys(this.classInfo).sort(),
			{
				placeHolder: "Type godot class name here",
				canPickMany: false,
			}
		);
		if (classname) {
			this.inspect_native_symbol({
				native_class: classname,
				symbol_name: classname,
			});
		}
	}

	private inspect_native_symbol(params: NativeSymbolInspectParams) {
		const id = this.messageCount--;
		this.io.writer.write({
			jsonrpc: "2.0",
			id: id,
			method: Methods.INSPECT_NATIVE_SYMBOL,
			params: params,
		});
		return id;
	}

	public on_message(message: NotificationMessage) {
		if ("id" in message) {
			const msg = message as ResponseMessage;
			const id = msg.id as number;
			const target = this.pendingInspections.get(id);
			this.pendingInspections.delete(id);

			if (id && id < 0) {
				const symbol = msg.result as GodotNativeSymbol;
				this.symbolDb[symbol.name] = symbol;
				symbol.class_info = this.classInfo[symbol.name];
				this.show_native_symbol(symbol, target);
				return;
			}
		}

		if (message.method == Methods.GDSCRIPT_CAPABILITIES) {
			for (const gdclass of (message.params as GodotCapabilities).native_classes) {
				this.classInfo[gdclass.name] = gdclass;
			}
			for (const gdclass of (message.params as GodotCapabilities).native_classes) {
				if (gdclass.inherits) {
					const extended_classes = this.classInfo[gdclass.inherits].extended_classes || [];
					extended_classes.push(gdclass.name);
					this.classInfo[gdclass.inherits].extended_classes = extended_classes;
				}
			}
		}
	}

	private show_native_symbol(symbol: GodotNativeSymbol, target?: string) {
		let key = symbol.name;
		if (target) {
			key += `.${target}`;
		}

		let panel;
		if (this.webViews.has(key)) {
			panel = this.webViews.get(key);
			this.webViews.delete(key);
		} else {
			panel = vscode.window.createWebviewPanel(
				"gddoc",
				symbol.name + ".gddoc",
				{
					viewColumn: this.get_new_native_symbol_column(),
					preserveFocus: true,
				},
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					enableFindWidget: true,
				}
			);
		}
		panel.title = symbol.name + ".gddoc";
		panel.webview.html = make_html_content(symbol, target);
		panel.webview.onDidReceiveMessage(this.on_webview_message.bind(this));

		if (target) {
			panel.webview.postMessage({
				command: "focus",
				target: target,
			});
		}
	}

	/**
	 * Returns placement for a new native symbol window based on the extension
	 * configuration and previously opened native symbols.
	 */
	private get_new_native_symbol_column(): ViewColumn {
		const config_placement = get_configuration("documentation.newTabPlacement");

		if (config_placement == "active") {
			return ViewColumn.Active;
		}

		const tab_groups = vscode.window.tabGroups;
		const visible_text_editors = vscode.window.visibleTextEditors;
		const editor_columns = visible_text_editors.map(editor => editor.viewColumn);

		// Assume the first non-editor column is the column where other native
		// symbols have been opened.

		const active_column = tab_groups.activeTabGroup.viewColumn;
		const is_non_editor_column_active = !editor_columns.includes(active_column);
		if (is_non_editor_column_active) {
			return active_column;
		}

		const all_columns = tab_groups.all.map(group => group.viewColumn);
		const first_non_editor_column = all_columns.find(column => !editor_columns.includes(column));
		if (first_non_editor_column) {
			return first_non_editor_column;
		} else {
			return ViewColumn.Beside;
		}
	}

	private on_webview_message(msg: any) {
		switch (msg.type) {
			case "INSPECT_NATIVE_SYMBOL":
				this.inspect_native_symbol(msg.data);
				break;
			default:
				break;
		}
	}
}

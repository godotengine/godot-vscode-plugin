import * as vscode from "vscode";
import {
	CancellationToken,
	CustomDocument,
	CustomDocumentOpenContext,
	CustomReadonlyEditorProvider,
	ExtensionContext,
	Uri,
	WebviewPanel,
} from "vscode";
import { NotificationMessage } from "vscode-jsonrpc";
import { MessageIO } from "./MessageIO";
import {
	Methods,
	NativeSymbolInspectParams,
	GodotNativeSymbol,
	GodotNativeClassInfo,
	GodotCapabilities,
} from "./gdscript.capabilities";
import { make_html_content } from "./native_document_builder";
import { createLogger } from "../utils";

const log = createLogger("docs");

export class NativeDocumentManager implements CustomReadonlyEditorProvider {
	public classInfo: { [key: string]: GodotNativeClassInfo } = {};
	public symbolDb: { [key: string]: GodotNativeSymbol } = {};

	constructor(private io: MessageIO, private client, context: ExtensionContext) {
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

	public register_capabilities(message: NotificationMessage) {
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

	public async list_native_classes() {
		const classname = await vscode.window.showQuickPick(
			Object.keys(this.classInfo).sort(),
			{
				placeHolder: "Type godot class name here",
				canPickMany: false,
			}
		);
		if (classname) {
			vscode.commands.executeCommand("vscode.open", this.make_uri(classname));
		}
	}

	public openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): CustomDocument {
		return { uri: uri, dispose: () => { } };
	}

	public async resolveCustomEditor(document: CustomDocument, panel: WebviewPanel, token: CancellationToken): Promise<void> {
		const className = document.uri.path.split(".")[0];
		const target = document.uri.fragment;
		let symbol: GodotNativeSymbol = null;

		panel.webview.options = {
			enableScripts: true,
		};

		if (className in this.symbolDb) {
			symbol = this.symbolDb[className];
		}

		if (!symbol && className in this.classInfo) {
			const params: NativeSymbolInspectParams = {
				native_class: className,
				symbol_name: className,
			};

			const response = await this.client.sendRequest("textDocument/nativeSymbol", params);

			symbol = response as GodotNativeSymbol;
			symbol.class_info = this.classInfo[symbol.name];
			this.symbolDb[symbol.name] = symbol;
		}

		panel.webview.html = make_html_content(symbol, target);
		panel.webview.onDidReceiveMessage(msg => {
			if (msg.type === "INSPECT_NATIVE_SYMBOL") {
				vscode.commands.executeCommand("vscode.open", this.make_uri(msg.data.native_class));
			}
		});

		if (target) {
			panel.webview.postMessage({
				command: "focus",
				target: target,
			});
		}
	}

	make_uri(path: string, fragment?: string) {
		return Uri.from({
			scheme: "gddoc",
			path: path + ".gddoc",
			fragment: fragment,
		});
	}
}

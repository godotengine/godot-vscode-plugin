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
import {
	NativeSymbolInspectParams,
	GodotNativeSymbol,
	GodotNativeClassInfo,
	GodotCapabilities,
} from "./gdscript.capabilities";
import { make_html_content } from "./native_document_builder";
import { createLogger, get_extension_uri } from "../utils";

const log = createLogger("docs");

export class NativeDocumentManager implements CustomReadonlyEditorProvider {
	public classInfo = new Map<string, GodotNativeClassInfo>();
	public symbolDb = new Map<string, GodotNativeSymbol>();
	public htmlDb = new Map<string, string>();

	private ready = false;

	constructor(private client, private context: ExtensionContext) {
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
		this.ready = true;
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

		while (!this.ready) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}

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
		if (!this.htmlDb.has(className)) {
			this.htmlDb[className] = make_html_content(panel.webview, symbol, target);
		}
		panel.webview.html = this.htmlDb[className];
		panel.iconPath = get_extension_uri("resources/godot_icon.svg");
		panel.webview.onDidReceiveMessage(msg => {
			if (msg.type === "INSPECT_NATIVE_SYMBOL") {
				const uri = this.make_uri(msg.data.native_class, msg.data.symbol_name);
				vscode.commands.executeCommand("vscode.open", uri);
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

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
import { SymbolKind, ResponseMessage } from "vscode-languageclient";
import { EventEmitter } from "events";
import * as Prism from "prismjs";
import { marked } from "marked";
import { MessageIO } from "./MessageIO";
import { get_configuration, createLogger } from "../utils";
import {
	Methods,
	NativeSymbolInspectParams,
	GodotNativeSymbol,
	GodotNativeClassInfo,
	GodotCapabilities,
} from "./gdscript.capabilities";

const log = createLogger("docs");

marked.setOptions({
	highlight: function (code, lang) {
		return Prism.highlight(code, GDScriptGrammar, lang);
	},
});

const enum WebViewMessageType {
	INSPECT_NATIVE_SYMBOL = "INSPECT_NATIVE_SYMBOL",
}

export class NativeDocumentManager extends EventEmitter implements CustomReadonlyEditorProvider {
	private io: MessageIO = null;
	public native_classes: { [key: string]: GodotNativeClassInfo } = {};

	private messageCount = -1;
	private pendingInspections: Map<number, string> = new Map();
	private webViews: Map<string, WebviewPanel> = new Map();

	constructor(io: MessageIO, context: ExtensionContext) {
		super();
		this.io = io;
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

	openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): CustomDocument {
		return { uri: uri, dispose: () => { } };
	}

	resolveCustomEditor(document: CustomDocument, webviewPanel: WebviewPanel, token: CancellationToken): void {
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
		if (symbolName in this.native_classes) {
			const id = this.inspect_native_symbol({
				native_class: symbolName,
				symbol_name: symbolName,
			});
			this.pendingInspections.set(id, undefined);
			return;
		}

		if (symbolName.includes(".")) {
			const parts = symbolName.split(".");
			const id = this.inspect_native_symbol({
				native_class: parts[0],
				symbol_name: parts[0],
			});
			this.pendingInspections.set(id, parts[1]);
			return;

		}
	}

	public async list_native_classes() {
		const classname = await vscode.window.showQuickPick(
			Object.keys(this.native_classes).sort(),
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
				this.show_native_symbol(msg.result as GodotNativeSymbol, target);
				return;
			}
		}

		if (message.method == Methods.GDSCRIPT_CAPABILITIES) {
			for (const gdclass of (message.params as GodotCapabilities)
				.native_classes) {
				this.native_classes[gdclass.name] = gdclass;
			}
			for (const gdclass of (message.params as GodotCapabilities)
				.native_classes) {
				if (gdclass.inherits) {
					const extended_classes =
						this.native_classes[gdclass.inherits].extended_classes || [];
					extended_classes.push(gdclass.name);
					this.native_classes[
						gdclass.inherits
					].extended_classes = extended_classes;
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
		panel.title = symbol.name;
		panel.webview.html = this.make_html_content(symbol, target);
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
			case WebViewMessageType.INSPECT_NATIVE_SYMBOL:
				this.inspect_native_symbol(msg.data);
				break;
			default:
				break;
		}
	}

	private make_html_content(symbol: GodotNativeSymbol, target?: string): string {
		let initialFocus = "";
		if (target) {
			initialFocus = `
				window.addEventListener('load', event => {
					document.getElementById('${target}').scrollIntoView();
				});
			`;
		}
		return  /*html*/`
		<html>
			<head>
				<style type="text/css">
					${PrismStyleSheet}
					.codeblock {
						padding: 0.5em;
						margin: .5em 0;
						overflow: auto;
						border-radius: 0.3em;
						!background-color: #fdf6e3;
					}
					a {
						text-decoration: none;
					}
				</style>
			</head>
			<body style="line-height: 16pt;">${this.make_symbol_document(symbol)}</body>
			<script>
				var vscode = acquireVsCodeApi();
				function inspect(native_class, symbol_name) {
					if (typeof(godot_class) != 'undefined' && godot_class == native_class) {
						document.getElementById(symbol_name).scrollIntoView();
					} else {
						vscode.postMessage({
							type: '${WebViewMessageType.INSPECT_NATIVE_SYMBOL}',
							data: {
								native_class: native_class,
								symbol_name: symbol_name
							}
						});
					}
				};
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.command) {
						case 'focus':
							document.getElementById(message.target).scrollIntoView();
							break;
					}
				});
				document.title = native_class;
				${initialFocus};
			</script>
		</html>`;
	}

	private make_symbol_document(symbol: GodotNativeSymbol): string {
		const classlink = make_link(symbol.native_class, undefined);
		const classinfo = this.native_classes[symbol.native_class];

		function make_function_signature(s: GodotNativeSymbol, with_class = false) {
			const parts = /\((.*)?\)\s*\-\>\s*(([A-z0-9]+)?)$/.exec(s.detail);
			if (!parts) {
				return "";
			}
			const ret_type = make_link(parts[2] || "void", undefined);
			let args = (parts[1] || "").replace(
				/\:\s([A-z0-9_]+)(\,\s*)?/g,
				": <a href=\"\" onclick=\"inspect('$1', '$1')\">$1</a>$2"
			);
			args = args.replace(/\s=\s(.*?)[\,\)]/g, "");
			return `${ret_type} ${with_class ? `${classlink}.` : ""}${element(
				"a",
				s.name,
				{ href: `#${s.name}` }
			)}( ${args} )`;
		}

		function make_symbol_elements(
			s: GodotNativeSymbol,
			with_class = false
		): { index?: string; body: string } {
			switch (s.kind) {
				case SymbolKind.Property:
				case SymbolKind.Variable:
					{
						// var Control.anchor_left: float
						const parts = /\.([A-z_0-9]+)\:\s(.*)$/.exec(s.detail);
						if (!parts) {
							return;
						}
						const type = make_link(parts[2], undefined);
						const name = element("a", s.name, { href: `#${s.name}` });
						const title = element(
							"h4",
							`${type} ${with_class ? `${classlink}.` : ""}${s.name}`
						);
						const doc = element(
							"p",
							format_documentation(s.documentation, symbol.native_class)
						);
						const div = element("div", title + doc);
						return {
							index: type + " " + name,
							body: div,
						};
					}
					break;
				case SymbolKind.Constant:
					{
						// const Control.FOCUS_ALL: FocusMode = 2
						// const Control.NOTIFICATION_RESIZED = 40
						const parts = /\.([A-Za-z_0-9]+)(\:\s*)?([A-z0-9_\.]+)?\s*=\s*(.*)$/.exec(
							s.detail
						);
						if (!parts) {
							return;
						}
						const type = make_link(parts[3] || "int", undefined);
						const name = parts[1];
						const value = element("code", parts[4]);

						const title = element(
							"p",
							`${type} ${with_class ? `${classlink}.` : ""}${name} = ${value}`
						);
						const doc = element(
							"p",
							format_documentation(s.documentation, symbol.native_class)
						);
						const div = element("div", title + doc);
						return {
							body: div,
						};
					}
					break;
				case SymbolKind.Event:
					{
						const parts = /\.([A-z0-9]+)\((.*)?\)/.exec(s.detail);
						if (!parts) {
							return;
						}
						const args = (parts[2] || "").replace(
							/\:\s([A-z0-9_]+)(\,\s*)?/g,
							": <a href=\"\" onclick=\"inspect('$1', '$1')\">$1</a>$2"
						);
						const title = element(
							"p",
							`${with_class ? `signal ${with_class ? `${classlink}.` : ""}` : ""
							}${s.name}( ${args} )`
						);
						const doc = element(
							"p",
							format_documentation(s.documentation, symbol.native_class)
						);
						const div = element("div", title + doc);
						return {
							body: div,
						};
					}
					break;
				case SymbolKind.Method:
				case SymbolKind.Function:
					{
						const signature = make_function_signature(s, with_class);
						const title = element("h4", signature);
						const doc = element(
							"p",
							format_documentation(s.documentation, symbol.native_class)
						);
						const div = element("div", title + doc);
						return {
							index: signature,
							body: div,
						};
					}
					break;
				default:
					break;
			}
		}

		if (symbol.kind == SymbolKind.Class) {
			let doc = element("h2", `Native class ${symbol.name}`);
			const parts = /extends\s+([A-z0-9]+)/.exec(symbol.detail);
			let inherits = parts && parts.length > 1 ? parts[1] : "";
			if (inherits) {
				let inherits_chian = "";
				let base_class = this.native_classes[inherits];
				while (base_class) {
					inherits_chian += `${inherits_chian ? " >" : ""} ${make_link(
						base_class.name,
						undefined
					)}`;
					base_class = this.native_classes[base_class.inherits];
				}
				inherits = `Inherits: ${inherits_chian}`;
				doc += element("p", inherits);
			}
			if (classinfo && classinfo.extended_classes) {
				let inherited = "";
				for (const c of classinfo.extended_classes) {
					inherited += (inherited ? ", " : " ") + make_link(c, c);
				}
				doc += element("p", `Inherited by:${inherited}`);
			}

			let constants = "";
			let signals = "";
			let methods_index = "";
			let methods = "";
			let properties_index = "";
			let propertyies = "";
			let others = "";

			for (const s of symbol.children as GodotNativeSymbol[]) {
				const elements = make_symbol_elements(s);
				switch (s.kind) {
					case SymbolKind.Property:
					case SymbolKind.Variable:
						properties_index += element("li", elements.index);
						propertyies += element("li", elements.body, { id: s.name });
						break;
					case SymbolKind.Constant:
						constants += element("li", elements.body, { id: s.name });
						break;
					case SymbolKind.Event:
						signals += element("li", elements.body, { id: s.name });
						break;
					case SymbolKind.Method:
					case SymbolKind.Function:
						methods_index += element("li", elements.index);
						methods += element("li", elements.body, { id: s.name });
						break;
					default:
						others += element("li", elements.body, { id: s.name });
						break;
				}
			}

			function add_group(title: string, block: string) {
				if (block) {
					doc += element("h3", title);
					doc += element("ul", block);
				}
			}

			doc += element(
				"p",
				format_documentation(symbol.documentation, symbol.native_class)
			);
			add_group("Properties", properties_index);
			add_group("Constants", constants);
			add_group("Signals", signals);
			add_group("Methods", methods_index);
			add_group("Property Descriptions", propertyies);
			add_group("Method Descriptions", methods);
			add_group("Other Members", others);
			doc += element("script", `var godot_class = "${symbol.native_class}";`);

			return doc;
		} else {
			let doc = "";
			const elements = make_symbol_elements(symbol, true);
			if (elements.index) {
				const symbols: SymbolKind[] = [SymbolKind.Function, SymbolKind.Method];
				if (!symbols.includes(symbol.kind)) {
					doc += element("h2", elements.index);
				}
			}
			doc += element("div", elements.body);
			return doc;
		}
	}
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	content: string,
	props = {},
	new_line?: boolean,
	indent?: string
) {
	let props_str = "";
	for (const key in props) {
		if (props.hasOwnProperty(key)) {
			props_str += ` ${key}="${props[key]}"`;
		}
	}
	return `${indent || ""}<${tag} ${props_str}>${content}</${tag}>${new_line ? "\n" : ""
		}`;
}

function make_link(classname: string, symbol: string) {
	if (!symbol || symbol == classname) {
		return element("a", classname, {
			onclick: `inspect('${classname}', '${classname}')`,
			href: "",
		});
	} else {
		return element("a", `${classname}.${symbol}`, {
			onclick: `inspect('${classname}', '${symbol}')`,
			href: "",
		});
	}
}

function make_codeblock(code: string, language: string) {
	const md = marked.parse(`\`\`\`${language}\n ${code} \n\`\`\``);
	return `<div class="codeblock">${md}</div>`;
}

function format_documentation(p_bbcode: string, classname: string) {
	let html = p_bbcode.trim();
	const lines = html.split("\n");

	let in_code_block = false;
	let code_block_indent = -1;
	let cur_code_block = "";

	html = "";
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		const block_start = line.indexOf("[codeblock]");
		if (block_start != -1) {
			code_block_indent = block_start;
			in_code_block = true;
			line = line.replace("[codeblock]", "");
		} else if (in_code_block) {
			line = line.slice(code_block_indent, line.length);
		}

		if (in_code_block && line.indexOf("[/codeblock]") != -1) {
			line = line.replace("[/codeblock]", "");
			in_code_block = false;
			html += make_codeblock(cur_code_block, "gdscript");
			cur_code_block = "";
		}

		if (!in_code_block) {
			line = line.trim();
			// [i] [/u] [code] --> <i> </u> <code>
			line = line.replace(/(\[(\/?)([a-z]+)\])/g, "<$2$3>");
			// [Reference] --> <a>Reference</a>
			line = line.replace(
				/(\[([A-Z]+[A-Z_a-z0-9]*)\])/g,
				"<a href=\"\" onclick=\"inspect('$2', '$2')\">$2</a>"
			);
			// [method _set] --> <a>_set</a>
			line = line.replace(
				/(\[([a-z]+)\s+([A-Z_a-z][A-Z_a-z0-9]*)\])/g,
				`<a href="" onclick="inspect('${classname}', '$3')">$3</a>`
			);
			line += "<br/>";
			html += line;
		} else {
			line += "\n";
			if (cur_code_block || line.trim()) {
				cur_code_block += line;
			}
		}
	}

	return html;
}

const GDScriptGrammar = {
	comment: {
		pattern: /(^|[^\\])#.*/,
		lookbehind: true,
	},
	"string-interpolation": {
		pattern: /(?:f|rf|fr)(?:("""|''')[\s\S]+?\1|("|')(?:\\.|(?!\2)[^\\\r\n])*\2)/i,
		greedy: true,
		inside: {
			interpolation: {
				// "{" <expression> <optional "!s", "!r", or "!a"> <optional ":" format specifier> "}"
				pattern: /((?:^|[^{])(?:{{)*){(?!{)(?:[^{}]|{(?!{)(?:[^{}]|{(?!{)(?:[^{}])+})+})+}/,
				lookbehind: true,
				inside: {
					"format-spec": {
						pattern: /(:)[^:(){}]+(?=}$)/,
						lookbehind: true,
					},
					"conversion-option": {
						pattern: /![sra](?=[:}]$)/,
						alias: "punctuation",
					},
					rest: null,
				},
			},
			string: /[\s\S]+/,
		},
	},
	"triple-quoted-string": {
		pattern: /(?:[rub]|rb|br)?("""|''')[\s\S]+?\1/i,
		greedy: true,
		alias: "string",
	},
	string: {
		pattern: /(?:[rub]|rb|br)?("|')(?:\\.|(?!\1)[^\\\r\n])*\1/i,
		greedy: true,
	},
	function: {
		pattern: /((?:^|\s)func[ \t]+)[a-zA-Z_]\w*(?=\s*\()/g,
		lookbehind: true,
	},
	"class-name": {
		pattern: /(\bclass\s+)\w+/i,
		lookbehind: true,
	},
	decorator: {
		pattern: /(^\s*)@\w+(?:\.\w+)*/im,
		lookbehind: true,
		alias: ["annotation", "punctuation"],
		inside: {
			punctuation: /\./,
		},
	},
	keyword: /\b(?:if|elif|else|for|while|break|continue|pass|return|match|func|class|class_name|extends|is|onready|tool|static|export|setget|const|var|as|void|enum|preload|assert|yield|signal|breakpoint|rpc|sync|master|puppet|slave|remotesync|mastersync|puppetsync)\b/,
	builtin: /\b(?:PI|TAU|NAN|INF|_|sin|cos|tan|sinh|cosh|tanh|asin|acos|atan|atan2|sqrt|fmod|fposmod|floor|ceil|round|abs|sign|pow|log|exp|is_nan|is_inf|ease|decimals|stepify|lerp|dectime|randomize|randi|randf|rand_range|seed|rand_seed|deg2rad|rad2deg|linear2db|db2linear|max|min|clamp|nearest_po2|weakref|funcref|convert|typeof|type_exists|char|str|print|printt|prints|printerr|printraw|var2str|str2var|var2bytes|bytes2var|range|load|inst2dict|dict2inst|hash|Color8|print_stack|instance_from_id|preload|yield|assert|Vector2|Vector3|Color|Rect2|Array|Basis|Dictionary|Plane|Quat|RID|Rect3|Transform|Transform2D|AABB|String|Color|NodePath|RID|Object|Dictionary|Array|PoolByteArray|PoolIntArray|PoolRealArray|PoolStringArray|PoolVector2Array|PoolVector3Array|PoolColorArray)\b/,
	boolean: /\b(?:true|false)\b/,
	number: /(?:\b(?=\d)|\B(?=\.))(?:0[bo])?(?:(?:\d|0x[\da-f])[\da-f]*\.?\d*|\.\d+)(?:e[+-]?\d+)?j?\b/i,
	operator: /[-+%=]=?|!=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,
	punctuation: /[{}[\];(),.:]/,
};

const PrismStyleSheet =  /*css*/`
code[class*="language-"],
pre[class*="language-"] {
	color: #657b83; /* base00 */
	font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
	font-size: 1em;
	text-align: left;
	white-space: pre;
	word-spacing: normal;
	word-break: normal;
	word-wrap: normal;

	line-height: 1.5;

	-moz-tab-size: 4;
	-o-tab-size: 4;
	tab-size: 4;

	-webkit-hyphens: none;
	-moz-hyphens: none;
	-ms-hyphens: none;
	hyphens: none;
}

pre[class*="language-"]::-moz-selection, pre[class*="language-"] ::-moz-selection,
code[class*="language-"]::-moz-selection, code[class*="language-"] ::-moz-selection {
	background: #073642; /* base02 */
}

pre[class*="language-"]::selection, pre[class*="language-"] ::selection,
code[class*="language-"]::selection, code[class*="language-"] ::selection {
	background: #073642; /* base02 */
}

/* Code blocks */
pre[class*="language-"] {
	padding: 1em;
	margin: .5em 0;
	overflow: auto;
	border-radius: 0.3em;
}

:not(pre) > code[class*="language-"],
pre[class*="language-"] {
	background-color: #fdf6e3; /* base3 */
}

/* Inline code */
:not(pre) > code[class*="language-"] {
	padding: .1em;
	border-radius: .3em;
}

.token.comment,
.token.prolog,
.token.doctype,
.token.cdata {
	color: #93a1a1; /* base1 */
}

.token.punctuation {
	color: #586e75; /* base01 */
}

.namespace {
	opacity: .7;
}

.token.property,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted {
	color: #268bd2; /* blue */
}

.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.url,
.token.inserted {
	color: #2aa198; /* cyan */
}

.token.entity {
	color: #657b83; /* base00 */
	background: #eee8d5; /* base2 */
}

.token.atrule,
.token.attr-value,
.token.keyword {
	color: #859900; /* green */
}

.token.function,
.token.class-name {
	color: #b58900; /* yellow */
}

.token.regex,
.token.important,
.token.variable {
	color: #cb4b16; /* orange */
}

.token.important,
.token.bold {
	font-weight: bold;
}
.token.italic {
	font-style: italic;
}

.token.entity {
	cursor: help;
}
`;

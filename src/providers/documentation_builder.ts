import * as vscode from "vscode";
import { SymbolKind } from "vscode-languageclient";
import * as Prism from "prismjs";
import * as csharp from "prismjs/components/prism-csharp";
import { marked } from "marked";
import { GodotNativeSymbol } from "../lsp/gdscript.capabilities";
import { get_extension_uri } from "../utils";
import yabbcode = require("ya-bbcode");

const parser = new yabbcode();

//! I do not understand why this is necessary
//! if you don't touch this csharp object, it's not imported or something, idk
const wtf = csharp;

marked.setOptions({
	highlight: function (code, lang) {
		if (lang === "gdscript") {
			return Prism.highlight(code, GDScriptGrammar, lang);
		}
		if (lang === "csharp") {
			return Prism.highlight(code, Prism.languages.csharp, lang);
		}
	},
});

// TODO: find a better way to apply this theming
let options = "";
const theme = vscode.window.activeColorTheme.kind;
if (theme === vscode.ColorThemeKind.Dark) {
	options = `{
		viewport: null,
		styles: {
			'header,footer,section,article': '#d4d4d480',
			'h1,a': '#d4d4d480',
			'h2,h3,h4': '#d4d4d480'
		},
		back: 'rgba(1,1,1,0.08)',
		view: '#79797933',
		drag: '#bfbfbf33',
		interval: 50
	}`;
} else if (theme === vscode.ColorThemeKind.Light) {
	options = `{
		viewport: null,
		styles: {
			'header,footer,section,article': 'rgba(0,0,0,0.08)',
			'h1,a': 'rgba(0,0,0,0.10)',
			'h2,h3,h4': 'rgba(0,0,0,0.08)'
		},
		back: 'rgba(0,0,0,0.08)',
		view: 'rgba(0,0,0,0.08)',
		drag: 'rgba(0,0,0,0.08)',
		interval: 50
	}`;
}

export function make_html_content(webview: vscode.Webview, symbol: GodotNativeSymbol, target?: string): string {
	const pagemapJsUri = webview.asWebviewUri(get_extension_uri("media", "pagemap.js"));
	const prismCssUri = webview.asWebviewUri(get_extension_uri("media", "prism.css"));
	const docsCssUri = webview.asWebviewUri(get_extension_uri("media", "docs.css"));

	let initialFocus = "";
	if (target) {
		initialFocus = `
			window.addEventListener('load', event => {
				document.getElementById('${target}').scrollIntoView();
			});
		`;
	}

	return  /*html*/`<!DOCTYPE html>
		<html>
		<head>
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link href="${docsCssUri}" rel="stylesheet">
			<link href="${prismCssUri}" rel="stylesheet">

			<title>${symbol.name}</title>
		</head>
		<body style="line-height: 16pt;">
			<main>
				${make_symbol_document(symbol)}
			</main>

			<canvas id='map'></canvas>
			
			<script src="${pagemapJsUri}"></script>
			<script>
				pagemap(document.querySelector('#map'), ${options});			
				${initialFocus};

				var vscode = acquireVsCodeApi();
				function inspect(native_class, symbol_name) {
					if (typeof (godot_class) != 'undefined' && godot_class == native_class) {
						document.getElementById(symbol_name).scrollIntoView();
					} else {
						vscode.postMessage({
							type: 'INSPECT_NATIVE_SYMBOL',
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
			</script>
		</body>
		</html>`;
}

export function make_symbol_document(symbol: GodotNativeSymbol): string {
	const classlink = make_link(symbol.native_class, undefined);

	function make_function_signature(s: GodotNativeSymbol, with_class = false) {
		const parts = /\((.*)?\)\s*\-\>\s*(([A-z0-9]+)?)$/.exec(s.detail);
		if (!parts) {
			return "";
		}
		const ret_type = make_link(parts[2] || "void", undefined);
		let args = (parts[1] || "").replace(
			/\:\s([A-z0-9_]+)(\,\s*)?/g,
			": <a href=\"\" onclick=\"inspect('$1')\">$1</a>$2"
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
						": <a href=\"\" onclick=\"inspect('$1')\">$1</a>$2"
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
		let doc = element("h2", `Class: ${symbol.name}`);
		if (symbol.class_info.inherits) {
			const inherits = make_link(symbol.class_info.inherits, undefined);
			doc += element("p", `Inherits: ${inherits}`);
		}

		if (symbol.class_info && symbol.class_info.extended_classes) {
			let inherited = "";
			for (const c of symbol.class_info.extended_classes) {
				inherited += (inherited ? ", " : " ") + make_link(c, c);
			}
			doc += element("p", `Inherited by:${inherited}`);
		}

		doc += element("p", format_documentation(symbol.documentation, symbol.native_class));

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

		const add_group = (title: string, block: string) => {
			if (block) {
				doc += element("h3", title);
				doc += element("ul", block);
			}
		};

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

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	content: string,
	props = {},
	new_line?: boolean,
	indent?: string
) {
	let props_str = "";
	for (const key in props) {
		if (Object.prototype.hasOwnProperty.call(props, key)) {
			props_str += ` ${key}="${props[key]}"`;
		}
	}
	return `${indent || ""}<${tag} ${props_str}>${content}</${tag}>${new_line ? "\n" : ""
		}`;
}

function make_link(classname: string, symbol: string) {
	if (!symbol || symbol == classname) {
		return element("a", classname, {
			onclick: `inspect('${classname}')`,
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
	const lines = code.split("\n");
	const indent = lines[0].match(/^\s*/)[0].length;
	code = lines.map(line => line.slice(indent)).join("\n");
	return marked.parse(`\`\`\`${language}\n${code}\n\`\`\``);
}

function format_documentation(bbcode: string, classname: string) {
	let html = parser.parse(bbcode.trim());

	html = html.replaceAll(/\[\/?codeblocks\](<br\/>)?/g, "");
	html = html.replaceAll("&quot;", "\"");

	for (const match of html.matchAll(/\[codeblock].*?\[\/codeblock]/gs)) {
		let block = match[0];
		block = block.replaceAll(/\[\/?codeblock\](<br\/>)?/g, "");
		block = block.replaceAll("<br/>", "\n");
		html = html.replace(match[0], make_codeblock(block, "gdscript"));
	}
	for (const match of html.matchAll(/\[gdscript].*?\[\/gdscript]/gs)) {
		let block = match[0];
		block = block.replaceAll(/\[\/?gdscript\](<br\/>)?/g, "");
		block = block.replaceAll("<br/>", "\n");
		html = html.replace(match[0], make_codeblock(block, "gdscript"));
	}
	for (const match of html.matchAll(/\[csharp].*?\[\/csharp]/gs)) {
		let block = match[0];
		block = block.replaceAll(/\[\/?csharp\](<br\/>)?/g, "");
		block = block.replaceAll("<br/>", "\n");
		html = html.replace(match[0], make_codeblock(block, "csharp"));
	}

	html = html.replaceAll("<br/>		", "");
	// [param <name>]
	html = html.replaceAll(
		/\[param\s+(@?[A-Z_a-z][A-Z_a-z0-9]*?)\]/g,
		"<code>$1</code>"
	);
	// [method <name>]
	html = html.replaceAll(
		/\[method\s+(@?[A-Z_a-z][A-Z_a-z0-9]*?)\]/g,
		`<a href="" onclick="inspect('${classname}', '$1')">$1</a>`
	);
	// [<reference>]
	html = html.replaceAll(
		/\[(\w+)\]/g,
		`<a href="" onclick="inspect('$1')">$1</a>` // eslint-disable-line quotes
	);
	// [method <class>.<name>]
	html = html.replaceAll(
		/\[\w+\s+(@?[A-Z_a-z][A-Z_a-z0-9]*?)\.(\w+)\]/g,
		`<a href="" onclick="inspect('$1', '$2')">$1.$2</a>` // eslint-disable-line quotes
	);

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

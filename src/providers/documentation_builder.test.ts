import { expect } from "chai";
import { SymbolKind } from "vscode-languageclient";

import { make_symbol_document } from "./documentation_builder";
import type { GodotNativeSymbol } from "./documentation_types";

type SymbolFields = Partial<GodotNativeSymbol> & Pick<GodotNativeSymbol, "name" | "kind">;

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

function make_symbol(fields: SymbolFields): GodotNativeSymbol {
	return { native_class: "Control", documentation: "", range, selectionRange: range, ...fields };
}

// A class page as the language server sends it, with the documentation under test on the class itself
function render(documentation: string, children: SymbolFields[] = []) {
	const symbol = make_symbol({
		name: "Control",
		kind: SymbolKind.Class,
		documentation,
		children: children.map(make_symbol),
	});
	return make_symbol_document(symbol);
}

const focus_all = { name: "FOCUS_ALL", kind: SymbolKind.Constant, detail: "const Control.FOCUS_ALL: FocusMode = 2" };

suite("Documentation Builder", () => {
	test("links plain references to members of the current class", () => {
		const html = render("Set [member size] or call [method grab_focus], then wait for [signal resized].");
		expect(html).to.include(`<a href="" onclick="inspect('Control', 'size')">size</a>`);
		expect(html).to.include(`<a href="" onclick="inspect('Control', 'grab_focus')">grab_focus</a>`);
		expect(html).to.include(`<a href="" onclick="inspect('Control', 'resized')">resized</a>`);
		expect(html).not.to.include("[member");
	});

	test("links references written as Class.member to that class", () => {
		const html = render("See [member Node.name] and [constant @GlobalScope.TYPE_INT].");
		expect(html).to.include(`<a href="" onclick="inspect('Node', 'name')">Node.name</a>`);
		expect(html).to.include(`<a href="" onclick="inspect('@GlobalScope', 'TYPE_INT')">@GlobalScope.TYPE_INT</a>`);
	});

	test("looks for constants and enums on the page first, then in @GlobalScope like Godot's editor", () => {
		const html = render("[constant FOCUS_ALL] [enum FocusMode] [constant OK] [enum Error]", [focus_all]);
		expect(html).to.include(`inspect('Control', 'FOCUS_ALL')`);
		expect(html).to.include(`inspect('Control', 'FocusMode')`);
		expect(html).to.include(`inspect('@GlobalScope', 'OK')`);
		expect(html).to.include(`inspect('@GlobalScope', 'Error')`);
	});

	test("links class names that share a name with a tag, like [Signal] and [GDScript]", () => {
		const html = render("A [Signal] or a [GDScript], then [method grab_focus].");
		expect(html).to.include(`<a href="" onclick="inspect('Signal')">Signal</a>`);
		expect(html).to.include(`<a href="" onclick="inspect('GDScript')">GDScript</a>`);
		expect(html).to.include(`inspect('Control', 'grab_focus')`);
	});

	test("renders [param], [kbd] and escaped brackets", () => {
		const html = render("Pass [param value], press [kbd]Ctrl + C[/kbd], and write [lb]b[rb] for bold.");
		expect(html).to.include("<code>value</code>");
		expect(html).to.include("<kbd>Ctrl + C</kbd>");
		expect(html).to.include("&#91;b&#93;");
		expect(html).not.to.include("inspect('b')");
	});

	test("keeps code blocks as written, without reading brackets inside them as tags or classes", () => {
		const html = render(
			"[codeblock lang=text]\n\t\t[section]\n\t\tfor (int i = 0; i < 3; i++) { a[i] = b[i]; }\n\t\t[/codeblock]",
		);
		expect(html).to.include(`class="language-text"`);
		expect(html).to.include("[section]");
		expect(html).to.include("a[i] = b[i];");
		expect(html).to.include("i &lt; 3");
		expect(html).not.to.include("inspect('section')");
		expect(html).not.to.include("<i>");
	});

	test("renders both languages of [codeblocks] without mangling C# interpolation", () => {
		const html = render(
			'[codeblocks]\n[gdscript]\nvar a = 1\n[/gdscript]\n[csharp]\nstring[] headers = [$"Length: {a}"];\n[/csharp]\n[/codeblocks]',
		);
		expect(html).to.include(`class="language-gdscript"`);
		expect(html).to.include(`class="language-csharp"`);
		// Highlighting only finds the interpolation when the $" reaches it intact
		expect(html).to.include('<span class="token string">$"Length: </span><span class="token interpolation">');
		expect(html).not.to.include("[codeblocks]");
		expect(html).not.to.include("quot;");
	});
});

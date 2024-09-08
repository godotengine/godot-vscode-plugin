import { TextEdit } from "vscode";
import type { TextDocument, TextLine } from "vscode";
import * as fs from "node:fs";
import * as vsctm from "vscode-textmate";
import * as oniguruma from "vscode-oniguruma";
import { keywords, symbols } from "./symbols";
import { get_configuration, get_extension_uri, createLogger } from "../utils";

const log = createLogger("formatter.tm");

// Promisify readFile
function readFile(path) {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (error, data) => (error ? reject(error) : resolve(data)));
	});
}

const grammarPath = get_extension_uri("syntaxes/GDScript.tmLanguage.json").fsPath;
const wasmPath = get_extension_uri("resources/onig.wasm").fsPath;
const wasmBin = fs.readFileSync(wasmPath).buffer;

// Create a registry that can create a grammar from a scope name.
const registry = new vsctm.Registry({
	onigLib: oniguruma.loadWASM(wasmBin).then(() => {
		return {
			createOnigScanner(patterns) {
				return new oniguruma.OnigScanner(patterns);
			},
			createOnigString(s) {
				return new oniguruma.OnigString(s);
			},
		};
	}),
	loadGrammar: (scopeName) => {
		if (scopeName === "source.gdscript") {
			return readFile(grammarPath).then((data) => vsctm.parseRawGrammar(data.toString(), grammarPath));
		}
		// console.log(`Unknown scope name: ${scopeName}`);
		return null;
	},
});

interface Token {
	// startIndex: number;
	// endIndex: number;
	scopes: string[];
	original: string;
	value: string;
	type?: string;
	param?: boolean;
	string?: boolean;
	skip?: boolean;
}

export interface FormatterOptions {
	maxEmptyLines: 1 | 2;
	denseFunctionParameters: boolean;
}

function get_formatter_options() {
	const options: FormatterOptions = {
		maxEmptyLines: get_configuration("formatter.maxEmptyLines") === "1" ? 1 : 2,
		denseFunctionParameters: get_configuration("formatter.denseFunctionParameters"),
	};

	return options;
}

function parse_token(token: Token) {
	if (token.scopes.includes("string.quoted.gdscript")) {
		token.string = true;
	}
	if (token.scopes.includes("meta.function.parameters.gdscript")) {
		token.param = true;
	}
	if (token.scopes.includes("meta.literal.nodepath.gdscript")) {
		token.skip = true;
		token.type = "nodepath";
		return;
	}
	if (token.scopes.includes("meta.literal.nodepath.bare.gdscript")) {
		token.skip = true;
		token.type = "bare_nodepath";
		return;
	}
	if (token.scopes.includes("keyword.control.flow.gdscript")) {
		token.type = "keyword";
		return;
	}
	if (keywords.includes(token.value)) {
		token.type = "keyword";
		return;
	}
	if (symbols.includes(token.value)) {
		token.type = "symbol";
		return;
	}
	// "preload" is highlighted as a keyword but it behaves like a function
	if (token.value === "preload") {
		return;
	}
	if (token.scopes.includes("keyword.language.gdscript")) {
		token.type = "keyword";
		return;
	}
	if (token.scopes.includes("constant.language.gdscript")) {
		token.type = "constant";
		return;
	}
	if (token.scopes.includes("variable.other.gdscript")) {
		token.type = "variable";
		return;
	}
}

function between(tokens: Token[], current: number, options: FormatterOptions) {
	const nextToken = tokens[current];
	const prevToken = tokens[current - 1];
	const next = nextToken.value;
	const prev = prevToken?.value;

	// console.log(prevToken, nextToken);

	if (!prev) return "";

	if (next === "##") return " ";
	if (next === "#") return " ";
	if (prevToken.skip && nextToken.skip) return "";

	if (prev === "(") return "";

	if (nextToken.param) {
		if (options.denseFunctionParameters) {
			if (prev === "-") {
				if (tokens[current - 2]?.value === "=") return "";
				if (["keyword", "symbol"].includes(tokens[current - 2].type)) {
					return "";
				}
				if ([",", "("].includes(tokens[current - 2]?.value)) {
					return "";
				}
			}
			if (next === "%") return " ";
			if (prev === "%") return " ";
			if (next === "=") {
				if (tokens[current - 2]?.value === ":") return " ";
				return "";
			}
			if (prev === "=") {
				if (tokens[current - 3]?.value === ":") return " ";
				return "";
			}
			if (prevToken?.type === "symbol") return " ";
			if (nextToken.type === "symbol") return " ";
		} else {
			if (next === ":") {
				if (tokens[current + 1]?.value === "=") return " ";
			}
		}
	}

	if (next === ":") {
		if (["var", "const"].includes(tokens[current - 2]?.value)) {
			if (tokens[current + 1]?.value !== "=") return "";
			return " ";
		}
		if (prevToken?.type === "keyword") return "";
	}
	if (prev === "@") return "";

	if (prev === "-") {
		if (["keyword", "symbol"].includes(tokens[current - 2].type)) {
			return "";
		}
		if ([",", "(", "["].includes(tokens[current - 2]?.value)) {
			return "";
		}
	}

	if (prev === ":" && next === "=") return "";
	if (next === "(") {
		if (prev === "export") return "";
		if (prev === "func") return "";
		if (prev === "assert") return "";
	}

	if (prev === ")" && nextToken.type === "keyword") return " ";

	if (prev === "[" && nextToken.type === "symbol") return "";
	if (prev === "[" && nextToken.type === "nodepath") return "";
	if (prev === "[" && nextToken.type === "bare_nodepath") return "";
	if (prev === ":") return " ";
	if (prev === ";") return " ";
	if (prev === "##") return " ";
	if (prev === "#") return " ";
	if (next === "=") return " ";
	if (prev === "=") return " ";
	if (tokens[current - 2]?.value === "=") {
		if (["+", "-"].includes(prev)) return "";
	}
	if (prev === "(") return "";
	if (next === "{") return " ";
	if (next === "\\") return " ";
	if (next === "{}") return " ";

	if (prevToken?.type === "keyword") return " ";
	if (nextToken.type === "keyword") return " ";
	if (prevToken?.type === "symbol") return " ";
	if (nextToken.type === "symbol") return " ";

	if (prev === ",") return " ";

	return "";
}

let grammar = null;

registry.loadGrammar("source.gdscript").then((g) => {
	grammar = g;
});

function is_comment(line: TextLine): boolean {
	return line.text[line.firstNonWhitespaceCharacterIndex] === "#";
}

export function format_document(document: TextDocument, _options?: FormatterOptions): TextEdit[] {
	// quit early if grammar is not loaded
	if (!grammar) {
		return [];
	}
	const edits: TextEdit[] = [];

	const options = _options ?? get_formatter_options();

	let lineTokens: vsctm.ITokenizeLineResult = null;
	let onlyEmptyLinesSoFar = true;
	let emptyLineCount = 0;
	for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
		const line = document.lineAt(lineNum);

		// skip empty lines
		if (line.isEmptyOrWhitespace) {
			// delete empty lines at the beginning of the file
			if (onlyEmptyLinesSoFar) {
				edits.push(TextEdit.delete(line.rangeIncludingLineBreak));
			} else {
				emptyLineCount++;
			}

			// delete empty lines at the end of the file
			if (lineNum === document.lineCount - 1) {
				for (let i = lineNum - emptyLineCount + 1; i < document.lineCount; i++) {
					edits.push(TextEdit.delete(document.lineAt(i).rangeIncludingLineBreak));
				}
			}
			continue;
		}
		onlyEmptyLinesSoFar = false;

		// delete consecutive empty lines
		if (emptyLineCount) {
			for (let i = emptyLineCount - options.maxEmptyLines; i > 0; i--) {
				edits.push(TextEdit.delete(document.lineAt(lineNum - i).rangeIncludingLineBreak));
			}
			emptyLineCount = 0;
		}

		// skip comments
		if (is_comment(line)) {
			continue;
		}

		let nextLine = "";
		lineTokens = grammar.tokenizeLine(line.text, lineTokens?.ruleStack ?? vsctm.INITIAL);

		// TODO: detect whitespace type and automatically convert
		const leadingWhitespace = line.text.slice(0, line.firstNonWhitespaceCharacterIndex);
		nextLine += leadingWhitespace;
		const first = lineTokens.tokens[0];
		if (line.text.slice(first.startIndex, first.endIndex).trim() === "") {
			lineTokens.tokens.shift();
		}

		const tokens: Token[] = [];
		for (const t of lineTokens.tokens) {
			const token: Token = {
				scopes: t.scopes,
				original: line.text.slice(t.startIndex, t.endIndex),
				value: line.text.slice(t.startIndex, t.endIndex).trim(),
			};
			parse_token(token);
			// skip whitespace tokens
			if (!token.string && token.value.trim() === "") {
				continue;
			}
			tokens.push(token);
		}
		for (let i = 0; i < tokens.length; i++) {
			log.debug(i, tokens[i].value, tokens[i]);
			if (i > 0 && tokens[i - 1].string === true && tokens[i].string === true) {
				nextLine += tokens[i].original;
			} else {
				nextLine += between(tokens, i, options) + tokens[i].value.trim();
			}
		}

		edits.push(TextEdit.replace(line.range, nextLine));
	}

	return edits;
}

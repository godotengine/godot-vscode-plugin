import { Range, TextDocument, TextEdit } from "vscode";
import * as fs from "fs";
import * as vsctm from "vscode-textmate";
import * as oniguruma from "vscode-oniguruma";
import { keywords, symbols } from "./symbols";
import { get_extension_uri } from "../utils";

// Promisify readFile
function readFile(path) {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (error, data) => error ? reject(error) : resolve(data));
	});
}

const grammarPath = get_extension_uri("syntaxes/GDScript.tmLanguage.json").fsPath;
const wasmPath = get_extension_uri("resources/onig.wasm").fsPath;
const wasmBin = fs.readFileSync(wasmPath).buffer;

// Create a registry that can create a grammar from a scope name.
const registry = new vsctm.Registry({
	onigLib: oniguruma.loadWASM(wasmBin).then(() => {
		return {
			createOnigScanner(patterns) { return new oniguruma.OnigScanner(patterns); },
			createOnigString(s) { return new oniguruma.OnigString(s); }
		};
	}),
	loadGrammar: (scopeName) => {
		if (scopeName === "source.gdscript") {
			return readFile(grammarPath).then(data => vsctm.parseRawGrammar(data.toString(), grammarPath));
		}
		console.log(`Unknown scope name: ${scopeName}`);
		return null;
	}
});

interface Token {
	// startIndex: number;
	// endIndex: number;
	scopes: string[];
	value: string;
	type?: string;
	param?: boolean;
	skip?: boolean;
}

function parse_token(token: Token) {
	if (token.scopes.includes("meta.function.parameters.gdscript")) {
		token.param = true;
	}
	if (token.scopes.includes("meta.literal.nodepath.gdscript")) {
		token.skip = true;
	}
	if (keywords.includes(token.value)) {
		token.type = "keyword";
		return;
	}
	if (symbols.includes(token.value)) {
		token.type = "symbol";
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

function between(tokens: Token[], current: number) {
	const nextToken = tokens[current];
	const prevToken = tokens[current - 1];
	const next = nextToken.value;
	const prev = prevToken?.value;

	// console.log(prevToken, nextToken);

	if (!prev) return "";

	if (next === "#") return " ";
	if (prevToken.skip) return "";

	if (nextToken.param) {
		if (next === "=") return "";
		if (prev === "=") return "";
		if (prevToken?.type === "symbol") return " ";
		if (nextToken.type === "symbol") return " ";
	}

	if (next === ":") {
		if (["var", "const"].includes(tokens[current - 2]?.value)) {
			if (tokens[current + 1]?.value !== "=") return "";
			return " ";
		}
		if (prevToken?.type === "keyword") return "";
	}
	if (prev === "@") return "";

	if (prev === ":" && next === "=") return "";
	if (next === "(") {
		if (prev === "export") return "";
		if (prev === "func") return "";
		if (prev === "assert") return "";
	}

	if (prev === ")" && nextToken.type === "keyword") return " ";

	if (prev === ":") return " ";
	if (prev === ";") return " ";
	if (prev === "#") return " ";
	if (next === "=") return " ";
	if (prev === "=") return " ";
	if (prev === "(") return "";
	if (next === "{") return " ";
	if (next === "{}") return " ";

	if (prevToken?.type === "keyword") return " ";
	if (nextToken.type === "keyword") return " ";
	if (prevToken?.type === "symbol") return " ";
	if (nextToken.type === "symbol") return " ";

	if (prev === ",") return " ";

	return "";
}

let grammar = null;

registry.loadGrammar("source.gdscript").then(g => { grammar = g; });

export function format_document(document: TextDocument): TextEdit[] {
	// quit early if grammar is not loaded
	if (!grammar) {
		return [];
	}
	const edits: TextEdit[] = [];

	let lineTokens: vsctm.ITokenizeLineResult = null;
	for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
		const line = document.lineAt(lineNum);

		// skip empty lines
		if (line.isEmptyOrWhitespace) {
			// delete empty lines
			if (lineNum === 0 || document.lineAt(lineNum - 1).isEmptyOrWhitespace) {
				const range = new Range(lineNum, 0, lineNum + 1, 0);
				edits.push(TextEdit.delete(range));
			}
			continue;
		}
		// skip comments
		if (line.text[line.firstNonWhitespaceCharacterIndex] === "#") {
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
			const value = line.text.slice(t.startIndex, t.endIndex).trim();
			// skip whitespace tokens
			if (value.trim() === "") {
				continue;
			}

			const token: Token = {
				scopes: t.scopes,
				value: value,
			};

			parse_token(token);
			tokens.push(token);
		}
		for (let i = 0; i < tokens.length; i++) {
			nextLine += between(tokens, i) + tokens[i].value;
		}

		edits.push(TextEdit.replace(line.range, nextLine));
	}

	return edits;
}

import { TextEdit } from "vscode";
import type { TextDocument, TextLine } from "vscode";
import * as fs from "node:fs";
import * as vsctm from "vscode-textmate";
import * as oniguruma from "vscode-oniguruma";
import { keywords, symbols } from "./symbols";
import {
	get_configuration,
	get_extension_uri,
	createLogger,
	is_debug_mode,
} from "../utils";
import { readFile } from "node:fs/promises";

const log = createLogger("formatter.tm");

const grammarPath = get_extension_uri(
	"syntaxes/GDScript.tmLanguage.json",
).fsPath;
const wasmPath = get_extension_uri("resources/onig.wasm").fsPath;
const wasmBin = fs.readFileSync(wasmPath).buffer;

// Create a registry that can create a grammar from a scope name.
const registry = new vsctm.Registry({
	onigLib: oniguruma
		.loadWASM(wasmBin as unknown as oniguruma.IOptions)
		.then(() => {
			return {
				createOnigScanner(patterns) {
					return new oniguruma.OnigScanner(patterns);
				},
				createOnigString(s) {
					return new oniguruma.OnigString(s);
				},
			};
		}),
	loadGrammar: async (scopeName) => {
		if (scopeName === "source.gdscript") {
			const data = await readFile(grammarPath);
			return vsctm.parseRawGrammar(data.toString(), grammarPath);
		}
		// console.log(`Unknown scope name: ${scopeName}`);
		return undefined;
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
	identifier?: boolean;
	inLambdaBody?: boolean;
}

export interface FormatterOptions {
	maxEmptyLines: number;
	denseFunctionParameters: boolean;
	spacesBeforeEndOfLineComment: 1 | 2;
	indentSize: number;
	insertSpaces: boolean;
	trimEmptyLines: boolean;
	enforceNewlineAfterControlFlow: boolean;
	enforceNewlineAfterMatchBranch: boolean;
}

function get_formatter_options() {
	const rawMaxEmptyLines = get_configuration("formatter.maxEmptyLines");
	const maxEmptyLines =
		typeof rawMaxEmptyLines === "number"
			? Math.max(0, Math.round(rawMaxEmptyLines))
			: 2;

	const options: FormatterOptions = {
		maxEmptyLines: maxEmptyLines,
		denseFunctionParameters: get_configuration(
			"formatter.denseFunctionParameters",
		),
		spacesBeforeEndOfLineComment:
			get_configuration("formatter.spacesBeforeEndOfLineComment") === "1"
				? 1
				: 2,
		indentSize: get_configuration("formatter.indentSize") ?? 4,
		insertSpaces: get_configuration("formatter.insertSpaces") ?? false,
		trimEmptyLines: get_configuration("formatter.trimEmptyLines") ?? true,
		enforceNewlineAfterControlFlow:
			get_configuration("formatter.enforceNewlineAfterControlFlow") ?? true,
		enforceNewlineAfterMatchBranch:
			get_configuration("formatter.enforceNewlineAfterMatchBranch") ?? false,
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
	if (token.scopes[0].includes("constant.numeric")) {
		token.type = "literal";
		return;
	}
	if (token.value.match(/[A-Za-z_]\w+/)) {
		token.identifier = true;
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
	// "preload" is highlighted as a keyword but it behaves like a function
	if (token.value === "preload") {
		return;
	}
	// "self" and "super" are highlighted as keywords but behave like identifiers
	if (token.value === "self" || token.value === "super") {
		token.type = "variable";
		return;
	}
	// "signal" is a keyword in declarations but a value reference in expressions
	// (e.g. yield(signal, "completed")). Trust the grammar scope.
	if (token.value === "signal") {
		if (token.scopes.includes("keyword.language.gdscript")) {
			token.type = "keyword";
		} else {
			token.type = "variable";
		}
		return;
	}
	// "yield" is a keyword but behaves like a function call — no space before (
	if (token.value === "yield") {
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
	if (token.scopes.includes("keyword.language.gdscript")) {
		token.type = "keyword";
		return;
	}
	if (
		token.scopes.includes("constant.language.gdscript") ||
		token.scopes.includes("constant.language.literal.gdscript")
	) {
		token.type = "constant";
		return;
	}
	if (token.scopes.includes("variable.other.gdscript")) {
		token.type = "variable";
		return;
	}
	if (token.scopes.includes("comment.line.number-sign.gdscript")) {
		token.type = "comment";
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

	if (next === "##")
		return options.spacesBeforeEndOfLineComment === 2 ? "  " : " ";
	if (next === "#")
		return options.spacesBeforeEndOfLineComment === 2 ? "  " : " ";
	if (prevToken.skip && nextToken.skip) return "";

	if (prev === "(") return "";
	if (prev === ".") {
		if (nextToken?.type === "symbol") return " ";
		return "";
	}
	if (next === ".") return "";

	if (nextToken.param && !nextToken.inLambdaBody && !prevToken?.inLambdaBody) {
		if (options.denseFunctionParameters) {
			if (prev === "-" || prev === "+") {
				if (tokens[current - 2]?.value === "=") return "";
				if (["keyword", "symbol"].includes(tokens[current - 2]?.type ?? "")) {
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

	if (prev === "-" || prev === "+") {
		if (next === "(") return " ";
		if (["keyword", "symbol"].includes(tokens[current - 2]?.type ?? "")) {
			return "";
		}
		if ([",", "(", "["].includes(tokens[current - 2]?.value)) {
			return "";
		}
		if (tokens[current - 2]?.value === "=") {
			return "";
		}
		if (nextToken.identifier) return " ";
		if (current === 1) return "";
	}

	if (prev === ":" && next === "=") return "";
	if (next === "(") {
		if (prev === "export") return "";
		if (prev === "func") return "";
		if (prev === "assert") return "";
		if (prev === "yield") return "";
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

let grammar: vsctm.IGrammar | null = null;

registry.loadGrammar("source.gdscript").then((g) => {
	grammar = g;
});

function is_comment(line: TextLine): boolean {
	return line.text[line.firstNonWhitespaceCharacterIndex] === "#";
}

function is_merge_conflict_marker(line: TextLine): boolean {
	const trimmed = line.text.trimStart();
	return (
		trimmed.startsWith("<<<<<<<") ||
		trimmed.startsWith("=======") ||
		trimmed.startsWith(">>>>>>>")
	);
}

export function format_document(
	document: TextDocument,
	_options?: FormatterOptions,
): TextEdit[] {
	// quit early if grammar is not loaded
	if (!grammar) {
		return [];
	}

	const edits: TextEdit[] = [];

	const options = _options ?? get_formatter_options();

	const blockKeywords = [
		"if",
		"elif",
		"else",
		"for",
		"while",
		"match",
		"when",
		"func",
	];

	let lastToken = "";
	let indentLevel = 0;
	let lineTokens: vsctm.ITokenizeLineResult | undefined = undefined;
	let onlyEmptyLinesSoFar = true;
	let emptyLineCount = 0;
	let inLambdaBody = false;

	// Utility function: Generate indentation string for specified level
	const make_indent = (level: number): string => {
		if (options.insertSpaces) {
			return " ".repeat(level * options.indentSize);
		} else {
			return "\t".repeat(level);
		}
	};

	for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
		const line = document.lineAt(lineNum);

		// skip empty lines
		if (line.isEmptyOrWhitespace) {
			// If there are whitespace characters (like spaces or tabs) within the line
			// and the configuration is set to clean, then clear the content.
			if (line.text.length > 0 && options.trimEmptyLines) {
				edits.push(TextEdit.replace(line.range, ""));
			}

			// delete empty lines at the beginning of the file
			if (onlyEmptyLinesSoFar) {
				edits.push(TextEdit.delete(line.rangeIncludingLineBreak));
			} else {
				emptyLineCount++;
			}

			// delete empty lines at the end of the file
			if (lineNum === document.lineCount - 1) {
				for (
					let i = lineNum - emptyLineCount + 1;
					i < document.lineCount;
					i++
				) {
					edits.push(
						TextEdit.delete(document.lineAt(i).rangeIncludingLineBreak),
					);
				}
			}
			continue;
		}

		onlyEmptyLinesSoFar = false;

		// delete consecutive empty lines
		if (emptyLineCount) {
			let maxEmptyLines = options.maxEmptyLines;
			if (lastToken === ":") {
				maxEmptyLines = 0;
			}
			for (let i = emptyLineCount - maxEmptyLines; i > 0; i--) {
				edits.push(
					TextEdit.delete(document.lineAt(lineNum - i).rangeIncludingLineBreak),
				);
			}
			emptyLineCount = 0;
		}

		// skip comments
		if (is_comment(line)) {
			continue;
		}

		// skip git merge conflict markers — formatting these corrupts them
		if (is_merge_conflict_marker(line)) {
			continue;
		}

		let nextLine = "";
		lineTokens = grammar.tokenizeLine(
			line.text,
			lineTokens?.ruleStack ?? vsctm.INITIAL,
		);

		// detect whitespace type and automatically convert
		const leadingWhitespace = line.text.slice(
			0,
			line.firstNonWhitespaceCharacterIndex,
		);

		// Count tabs and spaces separately, then calculate the actual logical indentation level.
		let tabs = 0;
		let spaces = 0;
		for (const ch of leadingWhitespace) {
			if (ch === "\t") {
				tabs++;
			} else if (ch === " ") {
				spaces++;
			}
		}
		indentLevel = tabs + Math.floor(spaces / options.indentSize);

		if (indentLevel < 0) indentLevel = 0;

		// Apply the calculated indentation
		nextLine += make_indent(indentLevel);

		const first = lineTokens.tokens[0];
		if (line.text.slice(first.startIndex, first.endIndex).trim() === "") {
			lineTokens.tokens.shift();
		}

		const tokens: Token[] = [];
		for (const t of lineTokens.tokens) {
			const token: Token = {
				scopes: [t.scopes.join(" "), ...t.scopes],
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
		// Track lambda bodies inside function call parameters.
		// When func() appears as a call argument, everything after it until
		// the closing ) of the outer call is a lambda body, and dense
		// parameter formatting should not apply there.
		let sawLambdaStart = false;
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].value === "func" && tokens[i].param) {
				sawLambdaStart = true;
				inLambdaBody = true;
			}
			// The closing ) of the outer call is not in param scope.
			// When we see it, we've exited the lambda body.
			if (tokens[i].value === ")" && !tokens[i].param) {
				inLambdaBody = false;
			}
			// Mark tokens inside the lambda body (but not the func/parens/colon
			// that start it, which should still get dense formatting).
			// The lambda start tokens (func, (, ), :) come before the body
			// content, so we only mark tokens after the lambda start colon.
			if (inLambdaBody && sawLambdaStart && tokens[i].value === ":") {
				sawLambdaStart = false; // colon is structural, don't mark it
			} else if (inLambdaBody && !sawLambdaStart) {
				tokens[i].inLambdaBody = true;
			}
		}

		let bracketDepth = 0;
		let forceNewLine = false;

		for (let i = 0; i < tokens.length; i++) {
			if (is_debug_mode()) log.debug(i, tokens[i].value, tokens[i]);

			if (forceNewLine) {
				indentLevel++;
				nextLine += `\n${make_indent(indentLevel)}`;
				nextLine += tokens[i].value.trim();
				forceNewLine = false;
			} else if (i === 0 && tokens[i].string) {
				// leading whitespace is already accounted for
				nextLine += tokens[i].original.trimStart();
			} else if (i > 0 && tokens[i - 1].string && tokens[i].string) {
				nextLine += tokens[i].original;
			} else {
				nextLine += between(tokens, i, options) + tokens[i].value.trim();
			}

			// Track parenthesis depth, skip dictionaries `{"a": 1}` and type annotations `func(a: int)`
			if (
				tokens[i].value === "(" ||
				tokens[i].value === "[" ||
				tokens[i].value === "{"
			) {
				bracketDepth++;
			} else if (
				tokens[i].value === ")" ||
				tokens[i].value === "]" ||
				tokens[i].value === "}"
			) {
				bracketDepth--;
			}

			// Detect control flow colon and trigger forced line break
            if (options.enforceNewlineAfterControlFlow && i < tokens.length - 1) {
                if (tokens[i].value === ":" && bracketDepth === 0) {

                    // Search forward for var/const
                    let hasVarOrConst = false;
                    for (let j = i - 1; j >= 0; j--) {
                        if (tokens[j].value === "var" || tokens[j].value === "const") {
                            hasVarOrConst = true;
                            break;
                        }
                    }

                    // Check what's after the colon.
                    let isTypeAnnotation = false;
                    if (i + 1 < tokens.length) {
                        const nextToken = tokens[i + 1];
                        if (nextToken.identifier || nextToken.value === "=") {
                            isTypeAnnotation = true;
                        }
                    }

                    if (hasVarOrConst) {
                        if (isTypeAnnotation) {
                            // 'var x: int' 或 'var x: = 1' ( Variable definition)
                            // => No newline
                        } else {
                            // 'var y:' ( Match mode variables)
                            // => Newline
                            forceNewLine = true;
                        }
                    } else {
                        let hasControlFlow = false;
                        for (let j = 0; j <= i; j++) {
                            if (blockKeywords.includes(tokens[j].value)) {
                                hasControlFlow = true;
                                break;
                            }
                        }

                        if (hasControlFlow) {
                            // 'if x:', 'match x:', 'func():'
                            // => Control flow, newline
                            forceNewLine = true;
                        } else if (isTypeAnnotation) {
                            // Function parameter: 'param: Type'
                            // => Type annotations, no newline
                        } else if (options.enforceNewlineAfterMatchBranch) {
                            const isIndented = leadingWhitespace.length > 0;
                            if (isIndented) {
                                forceNewLine = true;
                            }
                        }
                    }
                }
            }


			if (tokens[i].type !== "comment") {
				lastToken = tokens[i].value;
			}
		}

		edits.push(TextEdit.replace(line.range, nextLine));
	}

	return edits;
}

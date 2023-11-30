import { createLogger } from "../utils";

const log = createLogger("formatter");

const keywords = [
	"and",
	"as",
	"break",
	"breakpoint",
	"class_name",
	"class",
	"const",
	"continue",
	"elif",
	"else",
	"enum",
	"export",
	"extends",
	"for",
	"if",
	"in",
	"is",
	"master",
	"mastersync",
	"match",
	"not",
	"onready",
	"or",
	"pass",
	"puppet",
	"puppetsync",
	"remote",
	"remotesync",
	"return",
	"setget",
	"signal",
	"static",
	"tool",
	"var",
	"while",
	"yield",
];

const longsymbols = [
	"**",
	"<<",
	">>",
	"==",
	"!=",
	">=",
	"<=",
	"&&",
	"||",
	"+=",
	"-=",
	"*=",
	"/=",
	"%=",
	"**=",
	"&=",
	"^=",
	"|=",
	"<<=",
	">>=",
	":=",
	"->",
];

export function tokenize(input: string): string[] {
	let pos = 0;
	let tokenType: string | null = null;
	let inParamList = false;
	let parenDepth = 0;
	let prevToken: string | null = null;
	let prevPrevToken: string | null = null;

	// these functions are declared inside tokenize() so that pos and tokenType 
	// can be in function scope instead of global
	function readWhitespace() {
		let token = "";
		while (pos < input.length && !input.charAt(pos).trim()) {
			token += input.charAt(pos++);
		}
		return token;
	}

	function readName() {
		let token = "";
		while (input.charAt(pos).match(/[a-z_A-Z0-9]/)) {
			token += input.charAt(pos++);
		}
		if (keywords.includes(token)) {
			tokenType = "keyword";
		} else {
			tokenType = "name";
		}
		return token;
	}

	function readNode() {
		let token = "";
		if (!input.charAt(pos).match(/[\&\$\%\^]/)) {
			return token;
		}
		token += input.charAt(pos++);
		if (input.charAt(pos) === "\"" || input.charAt(pos) === "'") {
			token += readString();
		} else {
			while (input.charAt(pos).match(/[a-z_A-Z0-9\/\%]/)) {
				token += input.charAt(pos++);
			}
		}
		tokenType = "node";
		return token;
	}

	function readNumber() {
		let token = "";
		if (input.charAt(pos).match(/[0-9.e\-\_]/)) {
			token += input.charAt(pos++);
		}
		if (input.charAt(pos).match(/[0-9.e\-\_xb]/)) {
			token += input.charAt(pos++);
		}
		if (token === "0x") {
			while (input.charAt(pos).match(/[a-f0-9.e\-\_]/)) {
				token += input.charAt(pos++);
			}
		} else {
			while (input.charAt(pos).match(/[0-9.e\-\_]/)) {
				token += input.charAt(pos++);
			}
		}
		tokenType = "number";
		return token;
	}

	function readString() {
		let token = "";
		if (input.slice(pos, pos + 3) === "\"\"\"") {
			token += input.slice(pos, pos + 3);
			pos += 3;
			while (pos < input.length && input.slice(pos, pos + 3) !== "\"\"\"") {
				token += input.charAt(pos++);
			}
			token += input.slice(pos, pos + 3);
			pos += 3;
			tokenType = "string";
			return token;
		}
		if (input.slice(pos, pos + 3) === "'''") {
			token += input.slice(pos, pos + 3);
			pos += 3;
			while (pos < input.length && input.slice(pos, pos + 3) !== "'''") {
				token += input.charAt(pos++);
			}
			token += input.slice(pos, pos + 3);
			pos += 3;
			tokenType = "string";
			return token;
		}
		token += input.charAt(pos++);
		const quot = token.trim().charAt(0);
		while (pos < input.length && input.charAt(pos) !== quot) {
			token += input.charAt(pos++);
			if (input.charAt(pos - 1) === "\\") {
				token += input.charAt(pos++);
			}
		}
		token += input.charAt(pos++);
		tokenType = "string";
		return token;
	}

	function between(prev: string, next: string) {
		if (!prev) return "";
		if (!next) return "";
		if (next === "comment") return " ";
		if (inParamList) {
			if (prev === "comma") return " ";
			return "";
		}
		if (prev === "symbol") return " ";
		if (next === "symbol") return " ";
		if (prev === "comma") return " ";
		if (next === "comma") return "";
		if (prev === "bang") return "";
		if (prev === "keyword") return " ";
		if (next === "keyword") return " ";
		if (prev === "parens") return "";
		if (next === "parens") return "";

		if (prev === "number") return " ";
		if (prev === "name") return " ";
		if (prev === "node") return " ";
		return "";
	}

	let lastTokenType: string;
	let token: string;
	const tokens: string[] = [readWhitespace()];
	while (pos < input.length) {
		const char = input.charAt(pos);
		const nextChar = input.charAt(pos + 1);
		if (char === "#") {
			token = input.slice(pos).trim();
			tokenType = "comment";
			pos = input.length;
		} else if (longsymbols.includes(input.slice(pos, pos + 4))) {
			token = input.slice(pos, pos + 4);
			pos += 4;
			tokenType = "symbol";
		} else if (longsymbols.includes(input.slice(pos, pos + 3))) {
			token = input.slice(pos, pos + 3);
			pos += 3;
			tokenType = "symbol";
		} else if (longsymbols.includes(input.slice(pos, pos + 2))) {
			token = input.slice(pos, pos + 2);
			pos += 2;
			tokenType = "symbol";
		} else if (char === "!") {
			token = "!";
			tokenType = "bang";
			pos++;
		} else if (char === "@") {
			if (nextChar === "\"" || nextChar === "'") {
				pos++;
				token = "@" + readString();
				tokenType = "string";
			} else {
				pos++;
				token = "@" + readName();
				tokenType = "name";
			}
		} else if (char === "r" && (nextChar === "\"" || nextChar === "'")) {
			pos++;
			token = "r" + readString();
			tokenType = "string";
		} else if (char.match(/[\&\$\%\^]/) && nextChar.trim()) {
			token = readNode();
			tokenType = "node";
		} else if (char === "-" && nextChar.match(/[0-9\.a-z_A-Z]/)) {
			pos++;
			if (input.charAt(pos).match(/[a-z_A-Z]/)) {
				token = "-" + readName();
			} else {
				token = "-" + readNumber();
			}
		} else if (char === "." && nextChar.match(/[0-9]/)) {
			token = readNumber();
		} else if (char.match(/[a-z_A-Z]/)) {
			token = readName();
		} else if (char.match(/[0-9]/)) {
			token = readNumber();
		} else if (char === "{") {
			pos++;
			token = char;
			tokenType = "curly";
		} else if (char.match(/[\[\]\(\)\{\}\.]/)) {
			if (inParamList) {
				if (char === "(") {
					parenDepth++;
				}
				if (char === ")") {
					parenDepth--;
					if (parenDepth === 0) {
						inParamList = false;
					}
				}
			}
			pos++;
			token = char;
			tokenType = "parens";
		} else if (char === "\"" || char === "'") {
			token = readString();
			tokenType = "string";
		} else if (char === "," || char === ";" || char === ":") {
			pos++;
			token = char;
			tokenType = "comma";
		} else {
			pos++;
			token = char;
			tokenType = "symbol";
		}

		tokens.push(between(lastTokenType, tokenType) + "" + token);
		if (token === "(") {
			if (prevToken === "func" || prevPrevToken === "func") {
				inParamList = true;
				parenDepth = 1;
			}
		}

		lastTokenType = tokenType;
		prevToken = token;
		prevPrevToken = prevToken;
		readWhitespace();
	}
	return tokens;
}

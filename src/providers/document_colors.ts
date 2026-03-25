import * as vscode from "vscode";
import { EXTENSION_PREFIX } from "../utils";
import { Color8, NAMED_COLORS, hex, to_html, to_rgba32 } from "../utils/colors";

type Arg =
	| ArgString
	| ArgHexadecimal
	| ArgDecimal

type ArgRange = [start: number, end: number];
type ArgString = { type: "string", value: string, range: ArgRange };
type ArgHexadecimal = { type: "hexadecimal", value: number, range: ArgRange };
type ArgDecimal = { type: "decimal", value: number, range: ArgRange };

function argIsNumber(arg: Arg): arg is ArgHexadecimal | ArgDecimal {
	return typeof arg.value === "number";
}
function argIsString(arg: Arg): arg is ArgString {
	return typeof arg.value === "string";
}
function argIsOptionalNumber(arg: Arg | null): arg is ArgHexadecimal | ArgDecimal | null {
	return arg === null || argIsNumber(arg);
}

interface ColorExpression {
	text: string;
	fn: string;
	args: Arg[];
	range: vscode.Range;
}

interface ColorPresentationsContext {
	readonly document: vscode.TextDocument;
	readonly range: vscode.Range;
}

const SECTION_COLOR_PICKER = `${EXTENSION_PREFIX}.colorPicker`;

/**
 * This is GDScript's default color when no components are provided
 */
const COLOR_BLACK = new vscode.Color(0, 0, 0, 1);

/**
 * Matches `Color(<args>)` or `Color8(<args>)` or `Color.some_method(<args>)`
 *
 * Match groups: `fn` and `args`
 */
const RE_COLOR_EXPR = /(?<fn>\bColor(?:8|\.hex|\.from_rgba8)?)\((?<args>.*?)\)[^;\n]*?/;
/**
 * Matches arguments from an argument list
 *
 * Match group: `arg`
 */
const RE_ARGUMENTS = /(?:\s*(?:#[^\n]*\n)?\s*)(?<arg>.*?)(?:\s*(?:#[^\n]*\n)?\s*)(?:,|$)/;
/**
 * Match group: `constant`
 */
const RE_COLOR_CODE_CONSTANT = /(?<constant>\w+)/;
/**
 * Match group: `html`
 */
const RE_COLOR_CODE_HTML = /#?(?<html>[0-9a-fA-F]{3,8})/;
/**
 * Matches something that looks like a constant/named color
 *
 * Match group: `color`
 */
const RE_NAMED_COLOR = /\bColor.(?<color>[A-Z]+(?:_[A-Z]+)*)/;
/**
 * Matches decimal numbers
 *
 * Match group `decimal`
 */
const RE_DECIMAL = /(?<decimal>\d*\.\d+|\d+\.?)/;
/**
 * Matches hexadecimal numbers
 *
 * Match group: `hex`
 */
const RE_HEXADECIMAL = /(?<hex>0x[0-9a-fA-F]{1,8})/;
/**
 * Matches strings, not fool-proof but enough for what we're looking after
 *
 * Match group: `string`
 */
const RE_STRING = /["'](?<string>.*?)["']/;

export class GDDocumentColorProvider implements vscode.DocumentColorProvider {

	private colorPickerConfiguration: vscode.WorkspaceConfiguration;

	private precision: number;
	private padValues: boolean;
	private uppercaseHex: boolean;

	constructor(private context: vscode.ExtensionContext) {
		const selector: vscode.DocumentSelector = [
			{ language: "gdscript", scheme: "file" },
		];
		this.colorPickerConfiguration = vscode.workspace.getConfiguration(SECTION_COLOR_PICKER);
		context.subscriptions.push(
			vscode.languages.registerColorProvider(selector, this),
			vscode.workspace.onDidChangeConfiguration(e => {
				if(e.affectsConfiguration(SECTION_COLOR_PICKER)) {
					this.updatePrecision();
					this.updatePadValues();
					this.updateUppercaseHex();
				}
			}),
		);
		this.updatePrecision();
		this.updatePadValues();
		this.updateUppercaseHex();
	}

	private updatePrecision(): void {
		this.precision = this.colorPickerConfiguration.get("precision");
	}

	private updatePadValues(): void {
		this.padValues = this.colorPickerConfiguration.get("padValues");
	}

	private updateUppercaseHex(): void {
		this.uppercaseHex = this.colorPickerConfiguration.get("uppercaseHex");
	}

	async provideDocumentColors(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.ColorInformation[]> {
		const colors: vscode.ColorInformation[] = [];
		const text = document.getText();
		for (const match of text.matchAll(new RegExp(RE_COLOR_EXPR, "dgs"))) {
			const range = new vscode.Range(
				document.positionAt(match.index),
				document.positionAt(match.index + match[0].length)
			);
			const args = this.parseArgs(match.groups.args, match.indices.groups.args[0]);
			const color = this.interpretColor({
				text: match[0],
				fn: match.groups.fn,
				args,
				range,
			});
			if (color) {
				colors.push({ color, range });
			}
			if (await isCancelled(token)) {
				return colors;
			}
		}
		for (const match of text.matchAll(new RegExp(RE_NAMED_COLOR, "g"))) {
			const range = new vscode.Range(
				document.positionAt(match.index),
				document.positionAt(match.index + match[0].length)
			);
			const color = NAMED_COLORS[match.groups.color];
			if (color) {
				colors.push({ color, range });
			}
			if (await isCancelled(token)) {
				return colors;
			}
		}
		return colors;
	}

	provideColorPresentations(color: vscode.Color, context: ColorPresentationsContext, token: vscode.CancellationToken): vscode.ColorPresentation[] {
		const text = context.document.getText(context.range);
		const noEdit = new vscode.TextEdit(context.range, text); // no edit TextEdit
		const named_color = text.match(RE_NAMED_COLOR)?.groups.color;
		if (named_color) {
			return [
				{ label: `${this.stringifyColorRGBA(color)} 🔒`, textEdit: noEdit },
				{ label: `${this.stringifyColorFromRGBA8(color)} 🔒`, textEdit: noEdit },
				{ label: `${this.stringifyColorHTML(color)} 🔒`, textEdit: noEdit },
				{ label: `${this.stringifyColorHex(color)} 🔒`, textEdit: noEdit },
			];
		}
		const presentations: vscode.ColorPresentation[] = [
			{ label: this.stringifyColorRGBA(color) },
			{ label: this.stringifyColorFromRGBA8(color) },
			{ label: this.stringifyColorHTML(color) },
			{ label: this.stringifyColorHex(color) },
		];
		const indices = {
			"Color": 0,
			"Color.from_rgba8": 1,
			"Color.hex": 3,
		};
		const match = text.match(new RegExp(RE_COLOR_EXPR, "ds"));
		if (match) {
			const expr: ColorExpression = {
				text: match[0],
				fn: match.groups.fn,
				args: this.parseArgs(match.groups.args, match.indices.groups.args[0]),
				range: context.range,
			};
			const presentation = this.editColorExpression(expr, color);
			if (presentation) {
				presentations.splice(indices[expr.fn] ?? -1, 1);
				presentations.unshift(presentation);
			}
		}
		return presentations;
	}

	private toPrecision(p_value: number): string {
		let n = p_value;
		if (this.precision > 0) {
			if (this.padValues) {
				return n.toFixed(this.precision);
			}
			const e = 10 ** this.precision;
			n = Math.round(n * e) / e;
		}
		return n.toString(10);
	}

	private stringifyColorRGBA(color: vscode.Color): string {
		const red = this.toPrecision(color.red);
		const green = this.toPrecision(color.green);
		const blue = this.toPrecision(color.blue);
		const alpha = this.toPrecision(color.alpha);
		return `Color(${rgbaParams(red, green, blue, alpha, "1")})`;
	}

	private stringifyColorHTML(color: vscode.Color): string {
		let html = to_html(color);
		if (this.uppercaseHex) {
			html = html.toUpperCase();
		}
		return `Color("#${html}")`;
	}

	private stringifyColor8(color: vscode.Color): string {
		const { r8, g8, b8, a8 } = color8(color);
		return `Color8(${rgbaParams(r8, g8, b8, a8, 255)})`;
	}

	private stringifyColorFromRGBA8(color: vscode.Color): string {
		const { r8, g8, b8, a8 } = color8(color);
		return `Color.from_rgba8(${rgbaParams(r8, g8, b8, a8, 255)})`;
	}

	private stringifyColorHex(color: vscode.Color): string {
		return `Color.hex(0x${this.colorToHex(color)})`;
	}

	private colorToHex(color: vscode.Color): string {
		const hex = to_rgba32(color).toString(16).padStart(8, "0");
		return this.uppercaseHex
			? hex.toUpperCase()
			: hex; // lowercase by default
	}

	private interpretColor(expr: ColorExpression): vscode.Color | undefined {
		switch (expr.fn) {
			case "Color":
				return argMatchRun(expr.args, [interpretColor, interpretColorCode, interpretColorCodeAlpha, interpretColorRGB, interpretColorRGBA], this);
			case "Color8":
				return argMatchRun(expr.args, [interpretColorFromRGB8, interpretColorFromRGBA8], this);
			case "Color.from_rgba8":
				return argMatchRun(expr.args, [interpretColorFromRGB8, interpretColorFromRGBA8], this);
			case "Color.hex":
				return argMatchRun(expr.args, [interpretColorHex], this);
		}
	}

	private editColorExpression(expr: ColorExpression, color: vscode.Color): vscode.ColorPresentation | undefined {
		switch (expr.fn) {
			case "Color":
				return argMatchRun2(expr, color, [this.editColorCode, this.editColorRGB, this.editColorRGBA], this);
			case "Color8":
				return argMatchRun2(expr, color, [this.editColorRGB8, this.editColorRGBA8], this);
			case "Color.from_rgba8":
				return argMatchRun2(expr, color, [this.editColorFromRGB8, this.editColorFromRGBA8], this);
			case "Color.hex":
				return argMatchRun2(expr, color, [this.editColorHex], this);
		}
	}

	private editColorCode(expr: ColorExpression, color: vscode.Color, code: Arg): vscode.ColorPresentation {
		const newText = replaceArgs(expr.text, [code], [to_html(color)]);
		return {
			label: this.stringifyColorHTML(color),
			textEdit: vscode.TextEdit.replace(expr.range, newText),
		};
	}

	private editColorRGB(expr: ColorExpression, color: vscode.Color, red: Arg, green: Arg, blue: Arg): vscode.ColorPresentation {
		const presentation: vscode.ColorPresentation = { label: this.stringifyColorRGBA(color) };
		if (color.alpha === 1) {
			const newText = replaceArgs(expr.text, [red, green, blue], [color.red, color.green, color.blue]);
			presentation.textEdit = vscode.TextEdit.replace(expr.range, newText);
		}
		return presentation;
	}

	private editColorRGBA(expr: ColorExpression, color: vscode.Color, red: Arg, green: Arg, blue: Arg, alpha: Arg): vscode.ColorPresentation {
		const newText = replaceArgs(expr.text, [red, green, blue, alpha], [color.red, color.blue, color.green, color.alpha]);
		return {
			label: this.stringifyColorRGBA(color),
			textEdit: vscode.TextEdit.replace(expr.range, newText),
		};
	}

	private editColorRGB8(expr: ColorExpression, color: vscode.Color, red8: Arg, green8: Arg, blue8: Arg): vscode.ColorPresentation {
		const { r8, g8, b8 } = color8(color);
		const presentation: vscode.ColorPresentation = { label: this.stringifyColor8(color) };
		if (color.alpha === 1) {
			const newText = replaceArgs(expr.text, [red8, green8, blue8], [r8, g8, b8]);
			presentation.textEdit = vscode.TextEdit.replace(expr.range, newText);
		}
		return presentation;
	}

	private editColorRGBA8(expr: ColorExpression, color: vscode.Color, red8: Arg, green8: Arg, blue8: Arg, alpha8: Arg): vscode.ColorPresentation {
		const { r8, g8, b8, a8 } = color8(color);
		const newText = replaceArgs(expr.text, [red8, green8, blue8, alpha8], [r8, g8, b8, a8]);
		return {
			label: this.stringifyColor8(color),
			textEdit: vscode.TextEdit.replace(expr.range, newText),
		};
	}

	private editColorFromRGB8(expr: ColorExpression, color: vscode.Color, red8: Arg, green8: Arg, blue8: Arg): vscode.ColorPresentation {
		const { r8, g8, b8 } = color8(color);
		const presentation: vscode.ColorPresentation = { label: this.stringifyColorFromRGBA8(color) };
		if (color.alpha === 1) {
			const newText = replaceArgs(expr.text, [red8, green8, blue8], [r8, g8, b8]);
			presentation.textEdit = vscode.TextEdit.replace(expr.range, newText);
		}
		return presentation;
	}

	private editColorFromRGBA8(expr: ColorExpression, color: vscode.Color, red8: Arg, green8: Arg, blue8: Arg, alpha8: Arg): vscode.ColorPresentation {
		const { r8, g8, b8, a8 } = color8(color);
		const newText = replaceArgs(expr.text, [red8, green8, blue8, alpha8], [r8, g8, b8, a8]);
		return {
			textEdit: vscode.TextEdit.replace(expr.range, newText),
			label: this.stringifyColorFromRGBA8(color),
		};
	}

	private editColorHex(expr: ColorExpression, color: vscode.Color, p_hex: Arg): vscode.ColorPresentation {
		const newText = replaceArgs(expr.text, [p_hex], [`0x${this.colorToHex(color)}`]);
		return {
			textEdit: vscode.TextEdit.replace(expr.range, newText),
			label: this.stringifyColorHex(color),
		};
	}

	private parseArgs(args: string, offset: number): Arg[] {
		const results: Arg[] = [];
		for (const match of args.matchAll(new RegExp(RE_ARGUMENTS, "dgs"))) {
			const range: ArgRange = [...match.indices.groups.arg];
			range[0] += offset;
			range[1] += offset;
			const arg = this.parseArg(match.groups.arg, range);
			if (!arg) {
				break;
			}
			results.push(arg);
		}
		return results;
	}

	private parseArg(arg: string, range: [number, number]): Arg | undefined {
		const string = arg.match(RE_STRING)?.groups.string;
		if (string) {
			return {
				type: "string",
				value: string,
				range,
			};
		}
		const hexa = arg.match(RE_HEXADECIMAL)?.groups.hex;
		if (hexa) {
			return {
				type: "hexadecimal",
				value: Number.parseInt(hexa, 16),
				range,
			};
		}
		const decimal = arg.match(RE_DECIMAL)?.groups.decimal;
		if (decimal) {
			return {
				type: "decimal",
				value: (
					decimal.includes(".")
						? Number.parseFloat(decimal)
						: Number.parseInt(decimal, 10)
				),
				range,
			};
		}
		return;
	}
}

/**
 * Returns the provided components as a list of arguments but will omit {@link alpha} if equal to {@link alphaMax}
 */
function rgbaParams(red: any, green: any, blue: any, alpha: any, alphaMax: any): string {
	return alpha === alphaMax
		? `${red}, ${green}, ${blue}`
		: `${red}, ${green}, ${blue}, ${alpha}`;
}

/**
 * Convert from vscode.Color [0-1] range to Color8's [0-255] range
 */
function color8(color: vscode.Color): Color8 {
	return {
		r8: Math.round(color.red * 255),
		g8: Math.round(color.green * 255),
		b8: Math.round(color.blue * 255),
		a8: Math.round(color.alpha * 255),
	};
}

/**
 * Find and run functions that precisely accept `args` and return the first non-null result.
 */
function argMatchRun<T, U, V>(args: T[], fns: ((this: V, ...args: T[]) => U)[], thisArg?: V): U {
	for (const fn of fns) {
		if (args.length === fn.length) {
			const color = fn.apply(thisArg, args);
			if (color) {
				return color;
			}
		}
	}
}

/**
 * Find and run functions that precisely accept `[expr, color, ...args]` as arguments and return the first non-null result.
 */
function argMatchRun2<T, U>(expr: ColorExpression, color: vscode.Color, fns: ((this: U, expr: ColorExpression, color: vscode.Color, ...args: Arg[]) => T)[], thisArg?: U): T {
	for (const fn of fns) {
		if (expr.args.length === fn.length - 2) {
			const result = fn.apply(thisArg, [expr, color, ...expr.args]);
			if (result) {
				return result;
			}
		}
	}
}

function interpretColor(): vscode.Color {
	return COLOR_BLACK;
}

function interpretColorRGB(red: Arg, green: Arg, blue: Arg): vscode.Color | undefined {
	return interpretColorRGBA(red, green, blue, null);
}

function interpretColorRGBA(red: Arg, green: Arg, blue: Arg, alpha: Arg | null): vscode.Color | undefined {
	if (argIsNumber(red) && argIsNumber(green) && argIsNumber(blue) && argIsOptionalNumber(alpha)) {
		return new vscode.Color(red.value, green.value, blue.value, alpha?.value ?? 1);
	}
}

function interpretColorCode(code: Arg): vscode.Color | undefined {
	return interpretColorCodeAlpha(code, null);
}

function interpretColorCodeAlpha(code: Arg, alpha: Arg | null): vscode.Color | undefined {
	if (argIsString(code) && argIsOptionalNumber(alpha)) {
		const color = parseCode(code.value);
		return alpha
			? new vscode.Color(color.red, color.green, color.blue, alpha.value)
			: color;
	}
}

function interpretColorFromRGB8(red8: Arg, green8: Arg, blue8: Arg): vscode.Color | undefined {
	return interpretColorFromRGBA8(red8, green8, blue8, null);
}

function interpretColorFromRGBA8(red8: Arg, green8: Arg, blue8: Arg, alpha8: Arg | null): vscode.Color | undefined {
	if (argIsNumber(red8) && argIsNumber(green8) && argIsNumber(blue8) && argIsOptionalNumber(alpha8)) {
		return new vscode.Color(
			Math.floor(clamp(red8.value, 0, 255)) / 255,
			Math.floor(clamp(green8.value, 0, 255)) / 255,
			Math.floor(clamp(blue8.value, 0, 255)) / 255,
			alpha8 ? Math.floor(clamp(alpha8.value, 0, 255)) / 255 : 1
		);
	}
}

function interpretColorHex(arg: Arg): vscode.Color | undefined {
	if (argIsNumber(arg)) {
		return hex(arg.value);
	}
}

function replaceArgs(expr: string, args: Arg[], newArgs: any[]): string {
	let offset = 0;
	let newExpr = "";
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const newArg = newArgs[i];
		newExpr += expr.slice(offset, arg.range[0]);
		newExpr += `${newArg}`;
		offset = arg.range[1];
	}
	newExpr += expr.slice(offset);
	return newExpr;
}

function parseCode(code: string): vscode.Color {
	let html = code.match(RE_COLOR_CODE_HTML)?.groups?.html;
	if (html) {
		if (html.length === 3) {
			// RGB(3) to RRGGBB(6)
			html = html.replaceAll(/\w/g, "$&$&");
		}
		if (html.length === 4) {
			// RBGA(4) to RRGGBBAA(8)
			html = html.replaceAll(/\w/g, "$&$&");
		}
		if (html.length === 6) {
			// RRGGBB(6) to RRGGBBAA(8)
			html += "FF";
		}
		if (html.length === 8) {
			// RRGGBBAA(8)
			return hex(Number.parseInt(html, 16));
		}
	}
	const constant = code.match(RE_COLOR_CODE_CONSTANT)?.groups?.constant;
	if (constant && NAMED_COLORS[constant]) {
		return NAMED_COLORS[constant];
	}
	return COLOR_BLACK;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

/**
 * To be used within a loop to not monopolize the eventloop and check for cancellation.
 */
function isCancelled(token: vscode.CancellationToken): Promise<boolean> {
	return new Promise(resolve => setImmediate(() => resolve(token.isCancellationRequested)));
}

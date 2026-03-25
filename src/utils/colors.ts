import * as vscode from "vscode";

export interface Color8 {
	r8: number;
	g8: number;
	b8: number;
	a8: number;
}

export function vscodeColorsAreEqual(a?: vscode.Color, b?: vscode.Color): boolean {
	return (
		a !== null &&
		a !== undefined &&
		b !== null &&
		b !== undefined &&
		a.red === b.red &&
		a.green === b.green &&
		a.blue === b.blue &&
		a.alpha === b.alpha
	);
}

export function to_html(color: vscode.Color): string {
	let hex = to_rgba32(color);
	if (hex & 0xFFn) {
		hex >>= 8n;
		return hex.toString(16).padStart(6, "0");
	}
	return hex.toString(16).padStart(8, "0");
}

/**
 * Copied from https://github.com/godotengine/godot/blob/1aaea38e7f8dd9e2a94e2e339247fc976a84de75/core/math/color.cpp#L64-L74
 */
export function to_rgba32(color: vscode.Color): bigint {
	/** We need to use BigInts because otherwise JS will interpret `c` as a 32-bit signed integer when doing bitwise-operations */
	let c = BigInt(Math.round(color.red * 255));
	c <<= 8n;
	c |= BigInt(Math.round(color.green * 255));
	c <<= 8n;
	c |= BigInt(Math.round(color.blue * 255));
	c <<= 8n;
	c |= BigInt(Math.round(color.alpha * 255));
	return c;
}

/**
 * Copied from https://github.com/godotengine/godot/blob/1aaea38e7f8dd9e2a94e2e339247fc976a84de75/core/math/color.cpp#L284-L294
 */
export function hex(p_hex: number | bigint): vscode.Color {
	let hex = BigInt(p_hex);
	const a = Number(hex & 0xFFn) / 255;
	hex >>= 8n;
	const b = Number(hex & 0xFFn) / 255;
	hex >>= 8n;
	const g = Number(hex & 0xFFn) / 255;
	hex >>= 8n;
	const r = Number(hex & 0xFFn) / 255;
	hex >>= 8n;
	return new vscode.Color(r, g, b, a);
}

/**
 * Copied and reformated from https://github.com/godotengine/godot/blob/1aaea38e7f8dd9e2a94e2e339247fc976a84de75/core/math/color_names.inc#L49-L196
 */
export const NAMED_COLORS = {
	ALICE_BLUE: hex(0xF0F8FFFF),
	ANTIQUE_WHITE: hex(0xFAEBD7FF),
	AQUA: hex(0x00FFFFFF),
	AQUAMARINE: hex(0x7FFFD4FF),
	AZURE: hex(0xF0FFFFFF),
	BEIGE: hex(0xF5F5DCFF),
	BISQUE: hex(0xFFE4C4FF),
	BLACK: hex(0x000000FF),
	BLANCHED_ALMOND: hex(0xFFEBCDFF),
	BLUE: hex(0x0000FFFF),
	BLUE_VIOLET: hex(0x8A2BE2FF),
	BROWN: hex(0xA52A2AFF),
	BURLYWOOD: hex(0xDEB887FF),
	CADET_BLUE: hex(0x5F9EA0FF),
	CHARTREUSE: hex(0x7FFF00FF),
	CHOCOLATE: hex(0xD2691EFF),
	CORAL: hex(0xFF7F50FF),
	CORNFLOWER_BLUE: hex(0x6495EDFF),
	CORNSILK: hex(0xFFF8DCFF),
	CRIMSON: hex(0xDC143CFF),
	CYAN: hex(0x00FFFFFF),
	DARK_BLUE: hex(0x00008BFF),
	DARK_CYAN: hex(0x008B8BFF),
	DARK_GOLDENROD: hex(0xB8860BFF),
	DARK_GRAY: hex(0xA9A9A9FF),
	DARK_GREEN: hex(0x006400FF),
	DARK_KHAKI: hex(0xBDB76BFF),
	DARK_MAGENTA: hex(0x8B008BFF),
	DARK_OLIVE_GREEN: hex(0x556B2FFF),
	DARK_ORANGE: hex(0xFF8C00FF),
	DARK_ORCHID: hex(0x9932CCFF),
	DARK_RED: hex(0x8B0000FF),
	DARK_SALMON: hex(0xE9967AFF),
	DARK_SEA_GREEN: hex(0x8FBC8FFF),
	DARK_SLATE_BLUE: hex(0x483D8BFF),
	DARK_SLATE_GRAY: hex(0x2F4F4FFF),
	DARK_TURQUOISE: hex(0x00CED1FF),
	DARK_VIOLET: hex(0x9400D3FF),
	DEEP_PINK: hex(0xFF1493FF),
	DEEP_SKY_BLUE: hex(0x00BFFFFF),
	DIM_GRAY: hex(0x696969FF),
	DODGER_BLUE: hex(0x1E90FFFF),
	FIREBRICK: hex(0xB22222FF),
	FLORAL_WHITE: hex(0xFFFAF0FF),
	FOREST_GREEN: hex(0x228B22FF),
	FUCHSIA: hex(0xFF00FFFF),
	GAINSBORO: hex(0xDCDCDCFF),
	GHOST_WHITE: hex(0xF8F8FFFF),
	GOLD: hex(0xFFD700FF),
	GOLDENROD: hex(0xDAA520FF),
	GRAY: hex(0xBEBEBEFF),
	GREEN: hex(0x00FF00FF),
	GREEN_YELLOW: hex(0xADFF2FFF),
	HONEYDEW: hex(0xF0FFF0FF),
	HOT_PINK: hex(0xFF69B4FF),
	INDIAN_RED: hex(0xCD5C5CFF),
	INDIGO: hex(0x4B0082FF),
	IVORY: hex(0xFFFFF0FF),
	KHAKI: hex(0xF0E68CFF),
	LAVENDER: hex(0xE6E6FAFF),
	LAVENDER_BLUSH: hex(0xFFF0F5FF),
	LAWN_GREEN: hex(0x7CFC00FF),
	LEMON_CHIFFON: hex(0xFFFACDFF),
	LIGHT_BLUE: hex(0xADD8E6FF),
	LIGHT_CORAL: hex(0xF08080FF),
	LIGHT_CYAN: hex(0xE0FFFFFF),
	LIGHT_GOLDENROD: hex(0xFAFAD2FF),
	LIGHT_GRAY: hex(0xD3D3D3FF),
	LIGHT_GREEN: hex(0x90EE90FF),
	LIGHT_PINK: hex(0xFFB6C1FF),
	LIGHT_SALMON: hex(0xFFA07AFF),
	LIGHT_SEA_GREEN: hex(0x20B2AAFF),
	LIGHT_SKY_BLUE: hex(0x87CEFAFF),
	LIGHT_SLATE_GRAY: hex(0x778899FF),
	LIGHT_STEEL_BLUE: hex(0xB0C4DEFF),
	LIGHT_YELLOW: hex(0xFFFFE0FF),
	LIME: hex(0x00FF00FF),
	LIME_GREEN: hex(0x32CD32FF),
	LINEN: hex(0xFAF0E6FF),
	MAGENTA: hex(0xFF00FFFF),
	MAROON: hex(0xB03060FF),
	MEDIUM_AQUAMARINE: hex(0x66CDAAFF),
	MEDIUM_BLUE: hex(0x0000CDFF),
	MEDIUM_ORCHID: hex(0xBA55D3FF),
	MEDIUM_PURPLE: hex(0x9370DBFF),
	MEDIUM_SEA_GREEN: hex(0x3CB371FF),
	MEDIUM_SLATE_BLUE: hex(0x7B68EEFF),
	MEDIUM_SPRING_GREEN: hex(0x00FA9AFF),
	MEDIUM_TURQUOISE: hex(0x48D1CCFF),
	MEDIUM_VIOLET_RED: hex(0xC71585FF),
	MIDNIGHT_BLUE: hex(0x191970FF),
	MINT_CREAM: hex(0xF5FFFAFF),
	MISTY_ROSE: hex(0xFFE4E1FF),
	MOCCASIN: hex(0xFFE4B5FF),
	NAVAJO_WHITE: hex(0xFFDEADFF),
	NAVY_BLUE: hex(0x000080FF),
	OLD_LACE: hex(0xFDF5E6FF),
	OLIVE: hex(0x808000FF),
	OLIVE_DRAB: hex(0x6B8E23FF),
	ORANGE: hex(0xFFA500FF),
	ORANGE_RED: hex(0xFF4500FF),
	ORCHID: hex(0xDA70D6FF),
	PALE_GOLDENROD: hex(0xEEE8AAFF),
	PALE_GREEN: hex(0x98FB98FF),
	PALE_TURQUOISE: hex(0xAFEEEEFF),
	PALE_VIOLET_RED: hex(0xDB7093FF),
	PAPAYA_WHIP: hex(0xFFEFD5FF),
	PEACH_PUFF: hex(0xFFDAB9FF),
	PERU: hex(0xCD853FFF),
	PINK: hex(0xFFC0CBFF),
	PLUM: hex(0xDDA0DDFF),
	POWDER_BLUE: hex(0xB0E0E6FF),
	PURPLE: hex(0xA020F0FF),
	REBECCA_PURPLE: hex(0x663399FF),
	RED: hex(0xFF0000FF),
	ROSY_BROWN: hex(0xBC8F8FFF),
	ROYAL_BLUE: hex(0x4169E1FF),
	SADDLE_BROWN: hex(0x8B4513FF),
	SALMON: hex(0xFA8072FF),
	SANDY_BROWN: hex(0xF4A460FF),
	SEA_GREEN: hex(0x2E8B57FF),
	SEASHELL: hex(0xFFF5EEFF),
	SIENNA: hex(0xA0522DFF),
	SILVER: hex(0xC0C0C0FF),
	SKY_BLUE: hex(0x87CEEBFF),
	SLATE_BLUE: hex(0x6A5ACDFF),
	SLATE_GRAY: hex(0x708090FF),
	SNOW: hex(0xFFFAFAFF),
	SPRING_GREEN: hex(0x00FF7FFF),
	STEEL_BLUE: hex(0x4682B4FF),
	TAN: hex(0xD2B48CFF),
	TEAL: hex(0x008080FF),
	THISTLE: hex(0xD8BFD8FF),
	TOMATO: hex(0xFF6347FF),
	TRANSPARENT: hex(0xFFFFFF00),
	TURQUOISE: hex(0x40E0D0FF),
	VIOLET: hex(0xEE82EEFF),
	WEB_GRAY: hex(0x808080FF),
	WEB_GREEN: hex(0x008000FF),
	WEB_MAROON: hex(0x800000FF),
	WEB_PURPLE: hex(0x800080FF),
	WHEAT: hex(0xF5DEB3FF),
	WHITE: hex(0xFFFFFFFF),
	WHITE_SMOKE: hex(0xF5F5F5FF),
	YELLOW: hex(0xFFFF00FF),
	YELLOW_GREEN: hex(0x9ACD32FF),
} satisfies Record<string, vscode.Color>;

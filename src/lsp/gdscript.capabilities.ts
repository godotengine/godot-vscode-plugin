import { DocumentSymbol } from "vscode";

export const enum Methods {
	GDSCRIPT_CAPABILITIES = 'gdscript/capabilities',
	SHOW_NATIVE_SYMBOL = 'gdscript/show_native_symbol',
	INSPECT_NATIVE_SYMBOL = 'textDocument/nativeSymbol'
}

export interface NativeSymbolInspectParams {
	native_class: string;
	symbol_name: string;
}

export class GodotNativeSymbol extends DocumentSymbol {
	documentation: string;
	native_class: string;
}

export interface GodotNativeClassInfo {
	name: string;
	inherits: string;
	extended_classes?: string[];
}

export interface GodotCapabilities {
	native_classes: GodotNativeClassInfo[];
}

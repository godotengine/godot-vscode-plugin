import type { TreeItem } from "vscode";
import type { GodotNativeSymbol } from "../../providers/documentation_types";

// Base interface for tree items
export interface BaseTreeItem extends TreeItem {
	itemType: 'section' | 'property';
}

// Section item for class headers (Control, Node2D, etc.)
export interface SectionItem extends BaseTreeItem {
	itemType: 'section';
	className: string;
	propertyCount: number;
}

// Property item for individual properties within sections
export interface PropertyItem extends BaseTreeItem {
	itemType: 'property';
	property: GodotNativeSymbol;
	propertyType: string;
	source: 'script' | 'inherited' | 'direct';
	value?: string; // Current or default value
}

// Union type for all tree items
export type InspectorTreeItem = SectionItem | PropertyItem;

// Interface for property change messages
export interface PropertyChangeMessage {
	type: 'propertyChange';
	propertyName: string;
	newValue: string;
	propertyType: string;
}

// Interface for editor type determination
export interface PropertyEditorInfo {
	type: 'string' | 'number' | 'boolean' | 'multiline_string' | 'readonly';
	layout: 'horizontal' | 'vertical';
}

// Interface for property data
export interface PropertyData {
	property: GodotNativeSymbol;
	source: 'script' | 'inherited' | 'direct';
	currentValue?: string; // Current value from scene file
} 
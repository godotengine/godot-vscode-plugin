import * as vscode from "vscode";
import { GodotVariable, RawObject } from "./debug_runtime";
import {
	Vector2, Vector2i, Vector3, Vector3i, Vector4, Vector4i,
	Color, Basis, AABB, Plane, Quat, Rect2, Rect2i,
	Transform2D, Transform3D, Projection, NodePath, StringName,
	ObjectId
} from "./godot4/variables/variants";

/**
 * Compound type info for inline editing of Vector3, Color, etc.
 */
interface CompoundTypeInfo {
	type_name: string; // "Vector3", "Color", etc.
	components: string[]; // ["x", "y", "z"] or ["r", "g", "b", "a"]
	values: number[]; // Current values for each component
}

/**
 * Serializable property for sending to the WebView.
 * This matches the data we extract from the parse_variable logic.
 */
interface SerializedProperty {
	id: string;
	label: string;
	description: string;
	value_type: "number" | "bigint" | "boolean" | "string" | "null" | "object" | "array" | "map" | "objectId" | "compound" | "resourcePath";
	editable: boolean;
	changes_parent: boolean;
	object_id: number;
	raw_value?: any; // For editing, we need the actual value
	is_float?: boolean; // For number types, whether it's a float
	compound?: CompoundTypeInfo; // For inline compound editors
	children: SerializedProperty[];
}

/**
 * WebView-based Inspector that replaces the TreeView Inspector.
 * Provides inline editing for property values.
 */
export class InspectorWebView implements vscode.WebviewViewProvider {
	public static readonly viewType = "godotTools.nodeInspector";

	private view?: vscode.WebviewView;
	private viewReady = false; // Track if view is resolved and ready for messages
	private root: SerializedProperty | undefined;
	private currentElementName: string | undefined;
	private currentClassName: string | undefined;
	private currentObjectId: number | undefined;
	private isEditing = false; // Track if user is currently editing

	// Callback for when user edits a value
	private onEditCallback?: (objectId: number, propertyPath: string[], newValue: any, changesParent: boolean) => void;

	// Callback for when user edits a compound value (Vector3, Color, etc.)
	private onEditCompoundCallback?: (objectId: number, propertyName: string, reconstructedValue: any) => void;

	// Callback for when user clicks on an ObjectId to drill down into a resource
	private onInspectObjectCallback?: (objectId: string) => void;

	constructor(private readonly extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlContent(webviewView.webview);

		// Handle messages from the WebView
		webviewView.webview.onDidReceiveMessage(
			(message) => this.handleMessage(message),
			undefined
		);

		// Track when view is disposed
		webviewView.onDidDispose(() => {
			this.viewReady = false;
		});

		// Mark view as ready - now safe to post messages
		this.viewReady = true;
	}

	/**
	 * Check if the user is currently editing a value.
	 * Used to pause auto-refresh during editing.
	 */
	public get isCurrentlyEditing(): boolean {
		return this.isEditing;
	}

	/**
	 * Set callback for when user edits a value.
	 */
	public setEditCallback(callback: (objectId: number, propertyPath: string[], newValue: any, changesParent: boolean) => void): void {
		this.onEditCallback = callback;
	}

	/**
	 * Set callback for when user edits a compound value (Vector3, Color, etc.).
	 * The callback receives the reconstructed compound object ready to send to Godot.
	 */
	public setEditCompoundCallback(callback: (objectId: number, propertyName: string, reconstructedValue: any) => void): void {
		this.onEditCompoundCallback = callback;
	}

	/**
	 * Set callback for when user clicks on an ObjectId to drill down into a resource.
	 * This enables inspecting nested resources like Materials, Meshes, Textures, etc.
	 */
	public setInspectObjectCallback(callback: (objectId: string) => void): void {
		this.onInspectObjectCallback = callback;
	}

	/**
	 * Clear the inspector.
	 */
	public clear(): void {
		this.root = undefined;
		this.currentElementName = undefined;
		this.currentClassName = undefined;
		this.currentObjectId = undefined;

		// Only post message if view is ready (resolved and not disposed)
		if (this.view && this.viewReady) {
			this.view.webview.postMessage({
				type: "clear"
			});
		}
	}

	/**
	 * Fill the inspector with a variable tree.
	 * This mimics the InspectorProvider.fill_tree() API.
	 */
	public fill_tree(element_name: string, class_name: string, object_id: number, variable: GodotVariable): void {
		this.currentElementName = element_name;
		this.currentClassName = class_name;
		this.currentObjectId = object_id;

		// Parse the variable into a serializable tree
		this.root = this.parse_variable(variable, object_id, "root");
		this.root.label = element_name;
		this.root.description = class_name;

		// Only post message if view is ready (resolved and not disposed)
		if (this.view && this.viewReady) {
			this.view.webview.postMessage({
				type: "fill_tree",
				data: this.root,
				element_name,
				class_name,
				object_id
			});
		}
	}

	/**
	 * Check if the inspector has data.
	 */
	public has_tree(): boolean {
		return this.root !== undefined;
	}

	/**
	 * Get the top-level item info for refreshing.
	 */
	public get_top_item(): { label: string; object_id: number } | undefined {
		if (this.root) {
			return {
				label: this.currentElementName || this.root.label,
				object_id: this.currentObjectId || this.root.object_id
			};
		}
		return undefined;
	}

	/**
	 * Parse a GodotVariable into a serializable property tree.
	 * This logic is copied EXACTLY from inspector_provider.ts to ensure
	 * we capture ALL data types.
	 */
	private parse_variable(va: GodotVariable, object_id: number, id_prefix: string): SerializedProperty {
		const value = va.value;
		let rendered_value = "";
		let value_type: SerializedProperty["value_type"] = "null";
		let editable = false;
		let raw_value: any = undefined;
		let is_float = false;
		let compound: CompoundTypeInfo | undefined = undefined;

		// Determine type and render value - EXACTLY like inspector_provider.ts
		if (typeof value === "number") {
			value_type = "number";
			editable = true;
			raw_value = value;
			if (Number.isInteger(value)) {
				rendered_value = `${value}`;
				is_float = false;
			} else {
				rendered_value = `${Number.parseFloat(value.toFixed(5))}`;
				is_float = true;
			}
		} else if (typeof value === "bigint") {
			value_type = "bigint";
			editable = true;
			raw_value = value.toString();
			rendered_value = `${value}`;
		} else if (typeof value === "boolean") {
			value_type = "boolean";
			editable = true;
			raw_value = value;
			rendered_value = `${value}`;
		} else if (typeof value === "string") {
			// Check if this is a resource path (res://) - display as non-editable styled text
			if (value.startsWith("res://")) {
				value_type = "resourcePath";
				editable = false; // Cannot edit - would need Godot ResourceLoader
				raw_value = value;
				rendered_value = value;
			} else {
				value_type = "string";
				editable = true;
				raw_value = value;
				rendered_value = `${value}`;
			}
		} else if (typeof value === "undefined") {
			value_type = "null";
			editable = false;
			rendered_value = "null";
		} else {
			// Complex types
			if (Array.isArray(value)) {
				value_type = "array";
				rendered_value = `Array[${value.length}]`;
			} else if (value instanceof Map) {
				if (value instanceof RawObject) {
					value_type = "object";
					rendered_value = `${value.class_name}`;
				} else {
					value_type = "map";
					rendered_value = `Dictionary[${value.size}]`;
				}
			} else if (value instanceof ObjectId) {
				value_type = "objectId";
				rendered_value = `Object<${value.id}>`;
				raw_value = value.id.toString();
			} else if (typeof value.type_name === "function" && typeof value.stringify_value === "function") {
				// GDObject types (Vector3, Color, Basis, etc.)
				// Check if it's a simple compound type that should render inline
				const compoundInfo = this.getSimpleCompoundInfo(value);
				if (compoundInfo) {
					value_type = "compound";
					rendered_value = value.type_name();
					compound = compoundInfo;
				} else {
					value_type = "object";
					rendered_value = `${value.type_name()}${value.stringify_value()}`;
				}
			} else {
				value_type = "object";
				rendered_value = "[unknown]";
			}
		}

		// Get children - EXACTLY like inspector_provider.ts lines 115-134
		const children: SerializedProperty[] = [];

		// For compound types rendered inline, we still need children for the parent reconstruction logic
		// but they won't be displayed as expandable
		if (value) {
			let sub_variables: GodotVariable[] = [];

			if (typeof value.sub_values === "function" && !(value instanceof ObjectId)) {
				sub_variables = value.sub_values();
			} else if (Array.isArray(value)) {
				sub_variables = value.map((va, i) => {
					return { name: `${i}`, value: va };
				});
			} else if (value instanceof Map) {
				sub_variables = Array.from(value.keys()).map((va) => {
					const name = typeof va.rendered_value === "function" ? va.rendered_value() : `${va}`;
					const map_value = value.get(va);
					return { name: name, value: map_value };
				});
			}

			// Recursively parse children
			sub_variables.forEach((subVar, idx) => {
				const child = this.parse_variable(subVar, object_id, `${id_prefix}_${idx}`);
				children.push(child);
			});
		}

		// Determine if this is a compound type whose children affect the parent
		const is_compound = this.isCompoundGDObject(value);
		const is_array_or_dict = Array.isArray(value) || (value instanceof Map && !(value instanceof RawObject));

		// Mark children as changes_parent for compound types
		if (is_compound || is_array_or_dict) {
			for (const child of children) {
				child.changes_parent = true;
			}
		}

		return {
			id: id_prefix,
			label: va.name || "",
			description: rendered_value,
			value_type,
			editable,
			changes_parent: false, // Will be set by parent if needed
			object_id,
			raw_value,
			is_float,
			compound,
			children
		};
	}

	/**
	 * Get compound type info for simple types that should render inline (Vector2/3/4, Color, Quat).
	 * Returns undefined for complex types that should still use expand/collapse (Basis, Transform, AABB).
	 */
	private getSimpleCompoundInfo(value: any): CompoundTypeInfo | undefined {
		if (!value) return undefined;

		// Vector2/2i
		if (value instanceof Vector2 || value instanceof Vector2i) {
			return {
				type_name: value instanceof Vector2 ? "Vector2" : "Vector2i",
				components: ["x", "y"],
				values: [value.x, value.y]
			};
		}

		// Vector3/3i
		if (value instanceof Vector3 || value instanceof Vector3i) {
			return {
				type_name: value instanceof Vector3 ? "Vector3" : "Vector3i",
				components: ["x", "y", "z"],
				values: [value.x, value.y, value.z]
			};
		}

		// Vector4/4i
		if (value instanceof Vector4 || value instanceof Vector4i) {
			return {
				type_name: value instanceof Vector4 ? "Vector4" : "Vector4i",
				components: ["x", "y", "z", "w"],
				values: [value.x, value.y, value.z, value.w]
			};
		}

		// Color
		if (value instanceof Color) {
			return {
				type_name: "Color",
				components: ["r", "g", "b", "a"],
				values: [value.r, value.g, value.b, value.a]
			};
		}

		// Quaternion
		if (value instanceof Quat) {
			return {
				type_name: "Quaternion",
				components: ["x", "y", "z", "w"],
				values: [value.x, value.y, value.z, value.w]
			};
		}

		// Plane (normal.x/y/z + d)
		if (value instanceof Plane) {
			return {
				type_name: "Plane",
				components: ["x", "y", "z", "d"],
				values: [value.x, value.y, value.z, value.d]
			};
		}

		// Complex types - return undefined to use expand/collapse
		// Rect2, Rect2i, AABB, Basis, Transform2D, Transform3D, Projection
		return undefined;
	}

	/**
	 * Checks if a value is a compound GDObject type (Vector3, Color, etc.)
	 * Copied from inspector_provider.ts
	 */
	private isCompoundGDObject(value: any): boolean {
		if (!value) return false;

		return value instanceof Vector2 ||
			value instanceof Vector2i ||
			value instanceof Vector3 ||
			value instanceof Vector3i ||
			value instanceof Vector4 ||
			value instanceof Vector4i ||
			value instanceof Color ||
			value instanceof Basis ||
			value instanceof AABB ||
			value instanceof Plane ||
			value instanceof Quat ||
			value instanceof Rect2 ||
			value instanceof Rect2i ||
			value instanceof Transform2D ||
			value instanceof Transform3D ||
			value instanceof Projection ||
			value instanceof NodePath ||
			value instanceof StringName;
	}

	/**
	 * Handle messages from the WebView.
	 */
	private handleMessage(message: any): void {
		switch (message.type) {
			case "editing_started":
				this.isEditing = true;
				break;
			case "editing_finished":
				this.isEditing = false;
				break;
			case "edit_value":
				this.isEditing = false; // Editing is done when value is submitted
				this.handleEditValue(message);
				break;
			case "edit_compound":
				this.isEditing = false; // Editing is done when value is submitted
				this.handleEditCompound(message);
				break;
			case "inspect_object":
				// Handle clicking on ObjectId to drill down into a resource
				if (this.onInspectObjectCallback && message.objectId) {
					this.onInspectObjectCallback(message.objectId);
				}
				break;
		}
	}

	/**
	 * Handle an edit value request from the WebView.
	 */
	private handleEditValue(message: {
		objectId: number;
		propertyPath: string[];
		newValue: any;
		valueType: string;
		changesParent: boolean;
	}): void {
		if (!this.onEditCallback) {
			return;
		}

		let parsed_value: any;

		switch (message.valueType) {
			case "number":
				parsed_value = Number.parseFloat(message.newValue);
				if (Number.isNaN(parsed_value)) return;
				break;
			case "bigint":
				try {
					parsed_value = BigInt(message.newValue);
				} catch {
					return;
				}
				break;
			case "boolean":
				parsed_value = message.newValue === true || message.newValue === "true";
				break;
			case "string":
				parsed_value = message.newValue;
				break;
			default:
				return;
		}

		this.onEditCallback(message.objectId, message.propertyPath, parsed_value, message.changesParent);
	}

	/**
	 * Handle a compound value edit request from the WebView.
	 * This reconstructs the full compound value (Vector3, Color, etc.) before sending to Godot.
	 */
	private handleEditCompound(message: {
		objectId: number;
		propertyPath: string[];
		propertyName: string;
		compoundType: string;
		components: string[];
		values: number[];
		changedComponent: string;
		changedIndex: number;
	}): void {
		if (!this.onEditCompoundCallback) {
			return;
		}

		// Reconstruct the compound value based on type
		const reconstructedValue = this.reconstructCompoundValue(
			message.compoundType,
			message.components,
			message.values
		);

		if (reconstructedValue !== undefined) {
			this.onEditCompoundCallback(
				message.objectId,
				message.propertyName,
				reconstructedValue
			);
		}
	}

	/**
	 * Reconstruct a compound value (Vector3, Color, etc.) from component values.
	 */
	private reconstructCompoundValue(typeName: string, components: string[], values: number[]): any {
		switch (typeName) {
			case "Vector2":
				return new Vector2(values[0], values[1]);
			case "Vector2i":
				return new Vector2i(Math.round(values[0]), Math.round(values[1]));
			case "Vector3":
				return new Vector3(values[0], values[1], values[2]);
			case "Vector3i":
				return new Vector3i(Math.round(values[0]), Math.round(values[1]), Math.round(values[2]));
			case "Vector4":
				return new Vector4(values[0], values[1], values[2], values[3]);
			case "Vector4i":
				return new Vector4i(Math.round(values[0]), Math.round(values[1]), Math.round(values[2]), Math.round(values[3]));
			case "Color":
				return new Color(values[0], values[1], values[2], values[3]);
			case "Quaternion":
				return new Quat(values[0], values[1], values[2], values[3]);
			case "Plane":
				return new Plane(values[0], values[1], values[2], values[3]);
			default:
				return undefined;
		}
	}

	/**
	 * Generate the HTML content for the WebView.
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		const nonce = this.getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>Inspector</title>
	<style>
		:root {
			--row-height: 22px;
			--indent: 16px;
		}

		body {
			padding: 0;
			margin: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
		}

		.inspector {
			padding: 4px 0;
		}

		.property-row {
			display: flex;
			align-items: center;
			height: var(--row-height);
			padding: 0 8px;
			cursor: pointer;
			user-select: none;
		}

		.property-row:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.property-row.expanded > .expand-icon::before {
			content: "▼";
		}

		.property-row.collapsed > .expand-icon::before {
			content: "▶";
		}

		.expand-icon {
			width: 16px;
			font-size: 10px;
			color: var(--vscode-foreground);
			opacity: 0.7;
			flex-shrink: 0;
		}

		.property-label {
			color: var(--vscode-foreground);
			margin-right: 8px;
			flex-shrink: 0;
			white-space: nowrap;
		}

		.property-value {
			color: var(--vscode-descriptionForeground);
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.property-value.editable {
			color: var(--vscode-textLink-foreground);
			cursor: text;
		}

		.property-value.editable:hover {
			text-decoration: underline;
		}

		.property-children {
			display: none;
		}

		.property-row.expanded + .property-children {
			display: block;
		}

		.children-container {
			margin-left: var(--indent);
		}

		.root-item {
			font-weight: bold;
		}

		.root-item .property-value {
			color: var(--vscode-descriptionForeground);
			font-weight: normal;
		}

		/* Inline editing */
		.edit-input {
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, var(--vscode-focusBorder));
			padding: 1px 4px;
			font-family: inherit;
			font-size: inherit;
			outline: none;
			width: 100%;
			box-sizing: border-box;
		}

		.edit-input:focus {
			border-color: var(--vscode-focusBorder);
		}

		/* Checkbox for booleans */
		.bool-checkbox {
			margin-right: 4px;
			cursor: pointer;
		}

		/* Welcome message */
		.welcome {
			padding: 16px;
			color: var(--vscode-descriptionForeground);
			text-align: center;
		}

		/* ObjectId clickable */
		.property-value.object-id {
			color: var(--vscode-textLink-foreground);
			cursor: pointer;
		}

		.property-value.object-id:hover {
			text-decoration: underline;
		}

		/* Resource path (res://) - styled but not clickable */
		.property-value.resource-path {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			opacity: 0.9;
		}

		/* Compound type inline editors (Vector3, Color, etc.) */
		.compound-editor {
			display: flex;
			align-items: center;
			gap: 2px;
			flex: 1;
		}

		.compound-type-name {
			color: var(--vscode-descriptionForeground);
			margin-right: 4px;
			font-size: 0.9em;
		}

		.compound-inputs {
			display: flex;
			gap: 2px;
			flex: 1;
		}

		.compound-input-group {
			display: flex;
			align-items: center;
			gap: 1px;
		}

		.compound-input-label {
			color: var(--vscode-descriptionForeground);
			font-size: 0.85em;
			opacity: 0.7;
			min-width: 8px;
		}

		.compound-input {
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			padding: 1px 3px;
			font-family: inherit;
			font-size: 0.9em;
			width: 50px;
			min-width: 40px;
			box-sizing: border-box;
			text-align: right;
		}

		.compound-input:focus {
			border-color: var(--vscode-focusBorder);
			outline: none;
		}

		.compound-input:hover {
			border-color: var(--vscode-input-border, var(--vscode-focusBorder));
		}

		/* Color preview swatch */
		.color-swatch {
			width: 16px;
			height: 16px;
			border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
			border-radius: 2px;
			margin-right: 4px;
			flex-shrink: 0;
		}

		/* Filter toolbar */
		.inspector-toolbar {
			display: flex;
			padding: 4px 8px;
			border-bottom: 1px solid var(--vscode-panel-border);
			position: sticky;
			top: 0;
			background: var(--vscode-sideBar-background);
			z-index: 10;
			gap: 4px;
		}

		.filter-input {
			flex: 1;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			padding: 3px 6px;
			font-family: inherit;
			font-size: inherit;
			outline: none;
		}

		.filter-input:focus {
			border-color: var(--vscode-focusBorder);
		}

		.filter-input::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}

		.clear-button {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 0 6px;
			opacity: 0.6;
			font-size: 14px;
		}

		.clear-button:hover {
			opacity: 1;
		}

		.inspector-content {
			padding: 4px 0;
		}

		.filter-hidden {
			display: none !important;
		}
	</style>
</head>
<body>
	<div id="inspector" class="inspector">
		<div class="inspector-toolbar">
			<input id="filterInput" type="text" placeholder="Filter properties..." class="filter-input">
			<button id="clearFilter" class="clear-button" title="Clear filter">×</button>
		</div>
		<div id="properties" class="inspector-content">
			<div class="welcome">Node has not been inspected</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const propertiesContainer = document.getElementById("properties");
		const filterInput = document.getElementById("filterInput");
		const clearFilterBtn = document.getElementById("clearFilter");

		let currentData = null;
		// Track expanded paths to persist state across refreshes
		const expandedPaths = new Set();

		// Filter input handlers
		filterInput.addEventListener("input", (e) => {
			applyFilter(e.target.value);
		});

		clearFilterBtn.addEventListener("click", () => {
			filterInput.value = "";
			applyFilter("");
		});

		function applyFilter(filterText) {
			const lowerFilter = filterText.toLowerCase().trim();
			const containers = propertiesContainer.querySelectorAll(".property-container");

			containers.forEach(container => {
				const visible = shouldShowProperty(container, lowerFilter);
				container.classList.toggle("filter-hidden", !visible && lowerFilter !== "");
			});
		}

		function shouldShowProperty(container, filter) {
			if (!filter) return true;

			const row = container.querySelector(":scope > .property-row");
			const label = row?.querySelector(".property-label")?.textContent?.toLowerCase() || "";
			const value = row?.querySelector(".property-value")?.textContent?.toLowerCase() || "";
			// Also check compound editor inputs
			const compoundInputs = row?.querySelectorAll(".compound-input") || [];
			const compoundValues = Array.from(compoundInputs).map(input => input.value?.toLowerCase() || "").join(" ");

			// Check if this property matches
			const matches = label.includes(filter) || value.includes(filter) || compoundValues.includes(filter);

			// Check if any direct children match (recursive via DOM)
			const childrenContainer = container.querySelector(":scope > .property-children");
			if (childrenContainer) {
				const childContainers = childrenContainer.querySelectorAll(":scope > .children-container > .property-container");
				const hasMatchingChild = Array.from(childContainers).some(child => shouldShowProperty(child, filter));
				if (hasMatchingChild) return true;
			}

			return matches;
		}

		// Handle messages from the extension
		window.addEventListener("message", (event) => {
			const message = event.data;
			switch (message.type) {
				case "fill_tree":
					renderTree(message.data, message.element_name, message.class_name, message.object_id);
					break;
				case "clear":
					propertiesContainer.innerHTML = '<div class="welcome">Node has not been inspected</div>';
					currentData = null;
					expandedPaths.clear();
					break;
			}
		});

		function renderTree(data, elementName, className, objectId) {
			currentData = data;
			propertiesContainer.innerHTML = "";

			// Render root node
			const rootElement = renderProperty(data, [], true);
			propertiesContainer.appendChild(rootElement);

			// Re-apply filter if there's text in the filter input
			if (filterInput.value) {
				applyFilter(filterInput.value);
			}
		}

		function getPathKey(path) {
			return path.join("/");
		}

		function renderProperty(prop, path, isRoot = false) {
			const container = document.createElement("div");
			container.className = "property-container";

			// Build the current path including this property's label
			const currentPath = [...path, prop.label];
			const pathKey = getPathKey(currentPath);

			// Property row
			const row = document.createElement("div");
			row.className = "property-row" + (isRoot ? " root-item" : "");
			row.dataset.id = prop.id;
			row.dataset.path = JSON.stringify(currentPath);

			// For compound types, don't show expand icon - they render inline
			const hasChildren = prop.children && prop.children.length > 0 && prop.value_type !== "compound";

			// Expand/collapse icon
			const expandIcon = document.createElement("span");
			expandIcon.className = "expand-icon";
			if (hasChildren) {
				// Check if this path was previously expanded, or if it's root (always start expanded)
				const wasExpanded = isRoot || expandedPaths.has(pathKey);
				row.classList.add(wasExpanded ? "expanded" : "collapsed");

				// Update expandedPaths set for persistence
				if (wasExpanded) {
					expandedPaths.add(pathKey);
				}

				expandIcon.addEventListener("click", (e) => {
					e.stopPropagation();
					const isNowExpanded = row.classList.toggle("expanded");
					row.classList.toggle("collapsed");

					// Persist the expand state
					if (isNowExpanded) {
						expandedPaths.add(pathKey);
					} else {
						expandedPaths.delete(pathKey);
					}
				});
			}
			row.appendChild(expandIcon);

			// Label
			const label = document.createElement("span");
			label.className = "property-label";
			label.textContent = prop.label;
			row.appendChild(label);

			// Value - check for compound type first
			if (prop.value_type === "compound" && prop.compound) {
				// Render inline compound editor (Vector3, Color, etc.)
				const compoundEditor = renderCompoundEditor(prop, path);
				row.appendChild(compoundEditor);
			} else {
				// Regular value rendering
				const value = document.createElement("span");
				value.className = "property-value";

				if (prop.value_type === "boolean" && prop.editable) {
					// Boolean: show checkbox
					const checkbox = document.createElement("input");
					checkbox.type = "checkbox";
					checkbox.className = "bool-checkbox";
					checkbox.checked = prop.raw_value === true;
					checkbox.addEventListener("change", (e) => {
						e.stopPropagation();
						submitEdit(prop, currentPath, checkbox.checked);
					});
					value.appendChild(checkbox);
					value.appendChild(document.createTextNode(prop.description));
					value.classList.add("editable");
				} else if (prop.editable) {
					// Editable: click to edit inline
					value.textContent = prop.description;
					value.classList.add("editable");
					value.addEventListener("click", (e) => {
						e.stopPropagation();
						startEditing(value, prop, currentPath);
					});
				} else if (prop.value_type === "objectId") {
					// ObjectId: clickable to inspect
					value.textContent = prop.description;
					value.classList.add("object-id");
					value.addEventListener("click", (e) => {
						e.stopPropagation();
						vscode.postMessage({
							type: "inspect_object",
							objectId: prop.raw_value
						});
					});
				} else if (prop.value_type === "resourcePath") {
					// Resource path: styled but not clickable (cannot drill-down externally)
					value.textContent = prop.description;
					value.classList.add("resource-path");
					value.title = "Resource path - cannot inspect externally (requires Godot ResourceLoader)";
				} else {
					// Non-editable
					value.textContent = prop.description;
				}

				row.appendChild(value);
			}

			container.appendChild(row);

			// Children (skip for compound types - they render inline)
			if (hasChildren) {
				const childrenContainer = document.createElement("div");
				childrenContainer.className = "property-children";

				const childrenInner = document.createElement("div");
				childrenInner.className = "children-container";

				prop.children.forEach((child, idx) => {
					// Pass currentPath as the parent path for children
					const childElement = renderProperty(child, currentPath);
					childrenInner.appendChild(childElement);
				});

				childrenContainer.appendChild(childrenInner);
				container.appendChild(childrenContainer);
			}

			return container;
		}

		function renderCompoundEditor(prop, path) {
			const compound = prop.compound;
			const editor = document.createElement("div");
			editor.className = "compound-editor";

			// Type name (e.g., "Vector3")
			const typeName = document.createElement("span");
			typeName.className = "compound-type-name";
			typeName.textContent = compound.type_name;
			editor.appendChild(typeName);

			// For Color type, add a color swatch preview
			if (compound.type_name === "Color") {
				const swatch = document.createElement("div");
				swatch.className = "color-swatch";
				// Convert values (0-1) to CSS color
				const r = Math.round(Math.max(0, Math.min(1, compound.values[0])) * 255);
				const g = Math.round(Math.max(0, Math.min(1, compound.values[1])) * 255);
				const b = Math.round(Math.max(0, Math.min(1, compound.values[2])) * 255);
				const a = Math.max(0, Math.min(1, compound.values[3]));
				swatch.style.backgroundColor = "rgba(" + r + "," + g + "," + b + "," + a + ")";
				editor.appendChild(swatch);
			}

			// Input container
			const inputs = document.createElement("div");
			inputs.className = "compound-inputs";

			// Create an input for each component
			compound.components.forEach((componentName, idx) => {
				const group = document.createElement("div");
				group.className = "compound-input-group";

				// Component label (x, y, z, r, g, b, a, etc.)
				const compLabel = document.createElement("span");
				compLabel.className = "compound-input-label";
				compLabel.textContent = componentName;
				group.appendChild(compLabel);

				// Input field
				const input = document.createElement("input");
				input.type = "text";
				input.className = "compound-input";
				input.value = formatNumber(compound.values[idx]);
				input.dataset.component = componentName;
				input.dataset.index = String(idx);

				// Track focus for auto-refresh pause
				input.addEventListener("focus", (e) => {
					e.stopPropagation();
					vscode.postMessage({ type: "editing_started" });
				});

				// Handle input changes
				input.addEventListener("blur", (e) => {
					e.stopPropagation();
					const newValue = parseFloat(input.value);
					if (!isNaN(newValue) && newValue !== compound.values[idx]) {
						submitCompoundEdit(prop, path, componentName, idx, newValue, compound);
					} else {
						// Just notify editing finished if no change
						vscode.postMessage({ type: "editing_finished" });
					}
				});

				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						input.blur();
					} else if (e.key === "Escape") {
						e.preventDefault();
						input.value = formatNumber(compound.values[idx]);
						input.blur();
					} else if (e.key === "Tab") {
						// Allow Tab to move to next input naturally
					}
				});

				group.appendChild(input);
				inputs.appendChild(group);
			});

			editor.appendChild(inputs);
			return editor;
		}

		function formatNumber(val) {
			// Format number for display - show up to 5 decimal places but trim trailing zeros
			if (Number.isInteger(val)) return String(val);
			return parseFloat(val.toFixed(5)).toString();
		}

		function submitCompoundEdit(prop, path, componentName, componentIndex, newValue, compound) {
			// Build the new compound value array with the updated component
			const newValues = [...compound.values];
			newValues[componentIndex] = newValue;

			vscode.postMessage({
				type: "edit_compound",
				objectId: prop.object_id,
				propertyPath: [...path, prop.label],
				propertyName: prop.label,
				compoundType: compound.type_name,
				components: compound.components,
				values: newValues,
				changedComponent: componentName,
				changedIndex: componentIndex
			});
		}

		function startEditing(valueElement, prop, path) {
			// Don't start editing if already in edit mode
			if (valueElement.querySelector(".edit-input")) return;

			// Notify extension that editing started (pauses auto-refresh)
			vscode.postMessage({ type: "editing_started" });

			const originalValue = prop.description;

			// Create input
			const input = document.createElement("input");
			input.type = "text";
			input.className = "edit-input";
			input.value = prop.raw_value !== undefined ? String(prop.raw_value) : originalValue;

			// Replace content with input
			valueElement.textContent = "";
			valueElement.appendChild(input);
			input.focus();
			input.select();

			// Handle submit/cancel
			const finishEditing = (submit) => {
				if (submit) {
					const newValue = input.value;
					if (newValue !== String(prop.raw_value)) {
						submitEdit(prop, path, newValue);
					} else {
						// No change, just notify editing finished
						vscode.postMessage({ type: "editing_finished" });
					}
				} else {
					// Cancelled, notify editing finished
					vscode.postMessage({ type: "editing_finished" });
				}
				// Restore original display
				valueElement.textContent = originalValue;
			};

			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					finishEditing(true);
				} else if (e.key === "Escape") {
					e.preventDefault();
					finishEditing(false);
				}
			});

			input.addEventListener("blur", () => {
				finishEditing(true);
			});
		}

		function submitEdit(prop, path, newValue) {
			vscode.postMessage({
				type: "edit_value",
				objectId: prop.object_id,
				propertyPath: path,
				newValue: newValue,
				valueType: prop.value_type,
				changesParent: prop.changes_parent
			});
		}
	</script>
</body>
</html>`;
	}

	/**
	 * Generate a nonce for CSP.
	 */
	private getNonce(): string {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}

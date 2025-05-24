export function getWebviewStyles(): string {
	return `
		body {
			margin: 0;
			padding: 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
		}

		.empty-state {
			padding: 20px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
		}

		.properties-container {
			width: 100%;
		}

		.header {
			padding: 8px 0;
			border-bottom: 1px solid var(--vscode-panel-border);
			margin-bottom: 8px;
		}

		.header h3 {
			margin: 0;
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}

		.section {
			margin-bottom: 6px;
			border-radius: 6px;
			overflow: hidden;
			background-color: var(--vscode-sideBar-background);
		}

		.section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px 12px;
			background: linear-gradient(135deg, var(--vscode-sideBarSectionHeader-background) 0%, var(--vscode-button-secondaryBackground) 100%);
			color: var(--vscode-sideBarSectionHeader-foreground);
			cursor: pointer;
			font-weight: 600;
			font-size: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			border-top-left-radius: 6px;
			border-top-right-radius: 6px;
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		}

		.section-header-content {
			display: flex;
			align-items: center;
			flex: 1;
		}

		.section-toggle {
			margin-right: 6px;
			transition: transform 0.2s ease;
			font-size: 10px;
			font-weight: bold;
		}

		.section.collapsed .section-toggle {
			transform: rotate(-90deg);
		}

		.section-title {
			flex: 1;
			font-weight: 600;
		}

		.section-count {
			font-size: 10px;
			opacity: 0.7;
			background-color: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			padding: 1px 4px;
			border-radius: 8px;
			margin-left: 6px;
		}

		.docs-link {
			background: transparent;
			border: 1px solid var(--vscode-button-border);
			color: var(--vscode-button-foreground);
			padding: 2px 6px;
			border-radius: 3px;
			cursor: pointer;
			font-size: 11px;
			transition: all 0.2s ease;
			opacity: 0.8;
		}

		.docs-link:hover {
			background-color: var(--vscode-button-hoverBackground);
			opacity: 1;
			transform: scale(1.05);
		}

		/* Reset button styles */
		.reset-button {
			background: transparent;
			border: 1px solid var(--vscode-button-border);
			color: var(--vscode-button-foreground);
			padding: 1px 4px;
			border-radius: 2px;
			cursor: pointer;
			font-size: 10px;
			margin-left: 6px;
			opacity: 0.7;
			transition: all 0.2s ease;
		}

		.reset-button:hover {
			background-color: var(--vscode-button-hoverBackground);
			opacity: 1;
			transform: scale(1.1);
		}

		/* Property key adjustments to accommodate reset button */
		.property-key {
			display: flex;
			align-items: center;
			font-size: 13px;
			min-width: 0;
		}

		.section-content {
			background-color: var(--vscode-sideBar-background);
		}

		.section.collapsed .section-content {
			display: none;
		}

		/* Property row base styles - REMOVED borders for cleaner look */
		.property-row {
			min-height: 24px;
			padding: 4px 16px;
			transition: background-color 0.15s ease;
		}

		.property-row:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		/* Horizontal layout (traditional two-column) */
		.property-row.horizontal-layout {
			display: flex;
			align-items: center;
		}

		.property-row.horizontal-layout .property-key {
			flex: 1;
			display: flex;
			align-items: center;
			font-size: 13px;
			min-width: 0;
			margin-right: 8px;
		}

		.property-row.horizontal-layout .property-value {
			width: 120px;
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			font-size: 12px;
			text-align: right;
		}

		/* Vertical layout (full-width editors) */
		.property-row.vertical-layout {
			display: flex;
			flex-direction: column;
			padding: 6px 16px;
		}

		.property-row.vertical-layout .property-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 6px;
		}

		.property-row.vertical-layout .property-key {
			display: flex;
			align-items: center;
			font-size: 13px;
		}

		.property-row.vertical-layout .property-editor-container {
			width: 100%;
		}

		/* Property name and source indicator */
		.property-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.source-indicator {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			margin-right: 6px;
			border-radius: 2px;
			font-size: 10px;
			font-weight: bold;
			flex-shrink: 0;
		}

		.source-indicator.script {
			background-color: var(--vscode-charts-blue);
			color: white;
		}

		/* Type information */
		.type-info {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 100%;
		}

		/* Control containers for consistent width */
		.control-container {
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: flex-end;
		}

		/* Boolean controls with On/Off text */
		.boolean-container {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 6px;
		}

		.boolean-text {
			font-size: 12px;
			color: var(--vscode-foreground);
			min-width: 20px;
		}

		/* Property editors */
		.property-editor {
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			font-family: var(--vscode-font-family);
			font-size: 12px;
			padding: 2px 6px;
			outline: none;
			transition: border-color 0.2s ease;
		}

		.property-editor:focus {
			border-color: var(--vscode-focusBorder);
			box-shadow: 0 0 0 1px var(--vscode-focusBorder);
		}

		.property-editor:hover {
			background-color: var(--vscode-input-background);
		}

		/* String and number editors in horizontal layout */
		.horizontal-layout .string-editor,
		.horizontal-layout .number-editor {
			width: 100%;
			min-width: 60px;
		}

		/* Boolean editor */
		.boolean-editor {
			margin: 0;
			transform: scale(1.1);
		}

		/* Multiline editor (always in vertical layout) */
		.multiline-editor {
			width: 100%;
			min-height: 60px;
			resize: vertical;
			font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
		}

		/* Readonly display */
		.value-display {
			font-weight: 500;
			color: var(--vscode-foreground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 100%;
		}

		.value-display.readonly {
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			padding: 2px 6px;
			opacity: 0.8;
			font-style: italic;
			width: 100%;
		}

		/* Editor container for vertical layout */
		.property-editor-container {
			display: flex;
			flex-direction: column;
		}

		/* Responsive adjustments */
		@media (max-width: 300px) {
			.property-row.horizontal-layout {
				flex-direction: column;
				align-items: stretch;
			}

			.property-row.horizontal-layout .property-key {
				margin-right: 0;
				margin-bottom: 4px;
			}

			.property-row.horizontal-layout .property-value {
				align-items: stretch;
				text-align: left;
				width: 100%;
			}
		}
	`;
} 
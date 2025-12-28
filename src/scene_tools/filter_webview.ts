import * as vscode from "vscode";
import type { ScenePreviewProvider } from "./preview";

/**
 * WebView provider for the Scene Preview filter textbox.
 * This is a small panel that sits above the TreeView and provides
 * real-time fuzzy filtering of scene nodes.
 */
export class ScenePreviewFilterProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "godotTools.scenePreviewFilter";

	private view?: vscode.WebviewView;
	private scenePreviewProvider?: ScenePreviewProvider;

	constructor(private readonly extensionUri: vscode.Uri) {}

	/**
	 * Connect this filter to the ScenePreviewProvider for filtering.
	 */
	public setScenePreviewProvider(provider: ScenePreviewProvider): void {
		this.scenePreviewProvider = provider;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};

		webviewView.webview.html = this.getHtmlContent(webviewView.webview);

		// Handle messages from the WebView
		webviewView.webview.onDidReceiveMessage((message) => {
			switch (message.type) {
				case "filter":
					this.handleFilter(message.query);
					break;
			}
		});
	}

	private handleFilter(query: string): void {
		if (!this.scenePreviewProvider) {
			return;
		}

		if (query.trim() === "") {
			this.scenePreviewProvider.clearFilter();
		} else {
			this.scenePreviewProvider.applyFilter(query);
		}
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		html, body {
			height: auto;
			overflow: hidden;
		}
		body {
			padding: 2px 4px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			line-height: 1;
		}
		.filter-container {
			display: flex;
			gap: 4px;
			align-items: center;
			height: 22px;
		}
		.filter-input {
			flex: 1;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			padding: 2px 6px;
			font-family: inherit;
			font-size: inherit;
			outline: none;
			border-radius: 2px;
			height: 20px;
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
			padding: 2px 6px;
			opacity: 0.6;
			font-size: 14px;
			line-height: 1;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		.clear-button:hover {
			opacity: 1;
			background: var(--vscode-toolbar-hoverBackground);
		}
		.clear-button:focus {
			outline: 1px solid var(--vscode-focusBorder);
		}
	</style>
</head>
<body>
	<div class="filter-container">
		<input
			id="filterInput"
			type="text"
			placeholder="Filter by name or type..."
			class="filter-input"
			autocomplete="off"
			spellcheck="false"
		>
		<button id="clearFilter" class="clear-button" title="Clear filter (Esc)">×</button>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const filterInput = document.getElementById('filterInput');
		const clearBtn = document.getElementById('clearFilter');

		// Send filter message on every input (real-time filtering)
		filterInput.addEventListener('input', (e) => {
			vscode.postMessage({ type: 'filter', query: e.target.value });
		});

		// Clear button click
		clearBtn.addEventListener('click', () => {
			filterInput.value = '';
			filterInput.focus();
			vscode.postMessage({ type: 'filter', query: '' });
		});

		// Escape key clears the filter
		filterInput.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				filterInput.value = '';
				vscode.postMessage({ type: 'filter', query: '' });
			}
		});
	</script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

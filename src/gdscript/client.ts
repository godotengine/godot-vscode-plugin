import * as path from 'path';
import {
	LanguageClientOptions,
	ServerOptions,
	LanguageClient,
	TransportKind,
	NotificationType,
	NotificationHandler
} from 'vscode-languageclient';
import {
	workspace,
	ExtensionContext
} from 'vscode';

/**
 * GDScriptClient
 */
class GDScriptClient {

	private client_options: LanguageClientOptions;
	private server_options: ServerOptions;
	private context: ExtensionContext;

	constructor(context: ExtensionContext) {
		this.context = context;
		this.client_options = {
			// Register the server for gdscript documents
			documentSelector: ['gdscript'],
			synchronize: {
				// Synchronize the setting section 'languageServerExample' to the server
				configurationSection: 'GDScriptServer',
				// Notify the server about file changes to *.gd files contain in the workspace
				fileEvents: workspace.createFileSystemWatcher('*.gd')
			}
		};
		// The server is implemented in node
		let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
		// The debug options for the server
		let debugOptions = {
			execArgv: ["--nolazy", "--debug=6980"]
		};
		this.server_options = {
			run: {
				module: serverModule,
				transport: TransportKind.ipc
			},
			debug: {
				module: serverModule,
				transport: TransportKind.ipc,
				options: debugOptions
			}
		};
	}

	public createLanguageClient(): LanguageClient {
		const lc = new LanguageClient('GDScriptLanguage', this.server_options, this.client_options);
		lc.onNotification < string > ({method:"notify"}, this.onNotification.bind(this));
		return lc;
	}

	public onNotification(param: any) {
		console.log(param);
	}

}

export default GDScriptClient;
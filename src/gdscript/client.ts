import * as path from 'path';
import * as LanguageClient from 'vscode-languageclient';
import { workspace , ExtensionContext } from 'vscode';

/**
 * GDScriptClient
 */
class GDScriptClient {

  public client_options: LanguageClient.LanguageClientOptions;
	public server_options: LanguageClient.ServerOptions;
  
  constructor(context: ExtensionContext) {
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
		let debugOptions = { execArgv: ["--nolazy", "--debug=6980"] };
		this.server_options = {
			run : { module: serverModule, transport: LanguageClient.TransportKind.ipc },
			debug: { module: serverModule, transport: LanguageClient.TransportKind.ipc, options: debugOptions }
		};

  }

}

export default GDScriptClient;

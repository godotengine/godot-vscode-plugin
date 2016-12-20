import * as vscode from 'vscode';
import config from '../config';

class GDScriptWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    public provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): vscode.SymbolInformation[] {
      const scripts = config.getAllSymbols();
      const symbols: vscode.SymbolInformation[] = [];
      for (let path of Object.keys(scripts)) {
        const queryMembers = (query, members, kind: vscode.SymbolKind, path:string)=> {
          for (let name of Object.keys(members)) {
            const range: vscode.Range = members[name];
            if(name.toLowerCase().indexOf(query.toLowerCase()) != -1) {
              const symbol: vscode.SymbolInformation = {
                name,
                kind,
                containerName: "",
                location: {
                  uri: vscode.Uri.file(path),
                  range
                }
              };
              symbols.push(symbol);
            }
          }
        }
        const scrip = scripts[path];
        queryMembers(query, scrip.functions, vscode.SymbolKind.Function, path);
        queryMembers(query, scrip.signals, vscode.SymbolKind.Interface, path);
        queryMembers(query, scrip.variables, vscode.SymbolKind.Variable, path);
        queryMembers(query, scrip.constants, vscode.SymbolKind.Constant, path);
        queryMembers(query, scrip.classes, vscode.SymbolKind.Class, path);
      }
      return symbols;
    }
}

export default GDScriptWorkspaceSymbolProvider;
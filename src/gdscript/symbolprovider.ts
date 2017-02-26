import {
  DocumentSymbolProvider,
  TextDocument,
  SymbolInformation,
  CancellationToken,
  SymbolKind,
  Range,
  workspace
} from 'vscode';

import GDScriptSymbolParser from '../gdscript/symbolparser';
import config from '../config';

class GDScriptSymbolProvider implements DocumentSymbolProvider {
  private parser: GDScriptSymbolParser = null;

  constructor() {
    this.parser = new GDScriptSymbolParser();
  }

  provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]> {

    const symbols: SymbolInformation[] = [];
    var ignoreIndentedVars = false;
    if(workspace)
      ignoreIndentedVars = workspace.getConfiguration("GodotTools").get("ignoreIndentedVars", false);
    const script = this.parser.parseContent(document.getText(), ignoreIndentedVars);
    const signatures = script.signatures;
    config.setSymbols(document.fileName, script);

    const funcs = script.functions;
    for (let key of Object.keys(funcs))
      symbols.push(new SymbolInformation(key+signatures[key], SymbolKind.Function, funcs[key]));
    
    const signals = script.signals;
    for (let key of Object.keys(signals))
      symbols.push(new SymbolInformation(key+signatures[key], SymbolKind.Interface, signals[key]));

    const vars = script.variables;
    for (let key of Object.keys(vars))
      symbols.push(new SymbolInformation(key, SymbolKind.Variable, vars[key]));
    
    const consts = script.constants;
    for (let key of Object.keys(consts))
      symbols.push(new SymbolInformation(key, SymbolKind.Constant, consts[key]));

    const classes = script.classes;
    for (let key of Object.keys(classes))
      symbols.push(new SymbolInformation(key, SymbolKind.Class, classes[key]));
    
    return symbols;
  }

}

export default GDScriptSymbolProvider;
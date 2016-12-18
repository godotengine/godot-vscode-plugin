import {
  DocumentSymbolProvider,
  TextDocument,
  SymbolInformation,
  CancellationToken,
  SymbolKind,
  Range
} from 'vscode';

class GDScriptSymbolProvider implements DocumentSymbolProvider {
  constructor() {}

  provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]> {

    const symbols: SymbolInformation[] = [];
    const text  =document.getText();
    const lines = text.split(/\r?\n/);

    const getMatches = (string, regex, index=1) => {
      var matches = [];
      var match;
      while (match = regex.exec(string)) {
        matches.push(match[index]);
      }
      return matches;
    };
    
    const findLineRanges = (symbols, reg)=>{
      const sm = {};
      symbols.map((name:string)=>{
        let line = 0;
        let curline = 0;
        lines.map(l=>{
          const nreg = reg.replace("$X$", name);
          if(l.match(nreg) != null) {
            line = curline;
            return;
          }
          curline += 1;
        });
        sm[name] = line;
      });
      return sm;
    }
    
    let funcsnames = getMatches(text, /func\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(.*\)/gi, 1);
    const funcs = findLineRanges(funcsnames, "func\\s+$X$\\s*\\(.*\\)");
    for (let key of Object.keys(funcs))
      symbols.push(new SymbolInformation(key, SymbolKind.Function, new Range(funcs[key], 0, funcs[key],lines[funcs[key]].length)));
    
    let signalnames = getMatches(text, /signal\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(.*\)/gi, 1);
    const signals = findLineRanges(signalnames, "signal\\s+$X$\\s*\\(.*\\)");
    for (let key of Object.keys(signals))
      symbols.push(new SymbolInformation(key, SymbolKind.Interface, new Range(signals[key], 0, signals[key],lines[signals[key]].length)));
    
    let varnames = getMatches(text, /var\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/gi, 1);
    const vars = findLineRanges(varnames, "var\\s+$X$\\s*");
    for (let key of Object.keys(vars))
      symbols.push(new SymbolInformation(key, SymbolKind.Variable, new Range(vars[key], 0, vars[key],lines[vars[key]].length)));
    
    let constnames = getMatches(text, /const\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/gi, 1);
    const consts = findLineRanges(constnames, "const\\s+$X$\\s*");
    for (let key of Object.keys(consts))
      symbols.push(new SymbolInformation(key, SymbolKind.Constant, new Range(consts[key], 0, consts[key],lines[consts[key]].length)));
    
    return symbols;
  }

}

export default GDScriptSymbolProvider;
import {Range} from 'vscode';
import * as fs from 'fs';

interface GDScript {
  constants: {},
  functions: {},
  variables: {},
  signals: {},
  classes: {},
  base: string,
  native: string
}

class GDScriptSymbolParser {
  constructor() {
  }

  parseContent(content: string): GDScript {
    const script: GDScript = {
        constants: {},
        functions: {},
        variables: {},
        signals: {},
        classes: {},
        base: "Object",
        native: "Object"
    }
    const text  = content;
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
      script.functions[key] = new Range(funcs[key], 0, funcs[key],lines[funcs[key]].length);
    
    let signalnames = getMatches(text, /signal\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(.*\)/gi, 1);
    const signals = findLineRanges(signalnames, "signal\\s+$X$\\s*\\(.*\\)");
    for (let key of Object.keys(signals))
      script.signals[key] = new Range(signals[key], 0, signals[key],lines[signals[key]].length);
    
    let varnames = getMatches(text, /var\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/gi, 1);
    const vars = findLineRanges(varnames, "var\\s+$X$\\s*");
    for (let key of Object.keys(vars))
      script.variables[key] = new Range(vars[key], 0, vars[key],lines[vars[key]].length);
    
    let constnames = getMatches(text, /const\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/gi, 1);
    const consts = findLineRanges(constnames, "const\\s+$X$\\s*");
    for (let key of Object.keys(consts))
      script.constants[key] = new Range(consts[key], 0, consts[key],lines[consts[key]].length);
    
    let classnames = getMatches(text, /class\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*extends\s+/gi, 1);
    const classes = findLineRanges(classnames, "class\\s+$X$\\s*extends\\s+");
    for (let key of Object.keys(classes))
      script.classes[key] = new Range(classes[key], 0, classes[key],lines[classes[key]].length);

    return script;
  }

  parseFile(path:string): GDScript {
    const self = this;
    if(fs.existsSync(path) && fs.statSync(path).isFile()){
      const content = fs.readFileSync(path, 'utf-8');
      return this.parseContent(content);
    }
    return null;
  }

}

export default GDScriptSymbolParser;
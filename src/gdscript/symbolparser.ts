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
    
    const determRange = (key:string, array: any): Range =>{
      let line = array[key];
      let startAt = lines[line].indexOf(key);
      if(line < 0) line = 0;
      if(startAt < 0) startAt = 0;
      return new Range(line, startAt, line, startAt + key.length);
    };
    
    let funcsnames = getMatches(text, /func\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(.*\)/g, 1);
    const funcs = findLineRanges(funcsnames, "func\\s+$X$\\s*\\(.*\\)");
    for (let key of Object.keys(funcs))
      script.functions[key] = determRange(key, funcs);
    
    let signalnames = getMatches(text, /signal\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(.*\)/g, 1);
    const signals = findLineRanges(signalnames, "signal\\s+$X$\\s*\\(.*\\)");
    for (let key of Object.keys(signals))
      script.signals[key] = determRange(key, signals);

    let varnames = getMatches(text, /var\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/g, 1);
    const vars = findLineRanges(varnames, "var\\s+$X$\\s*");
    for (let key of Object.keys(vars))
      script.variables[key] = determRange(key, vars);
    
    let constnames = getMatches(text, /const\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/g, 1);
    const consts = findLineRanges(constnames, "const\\s+$X$\\s*");
    for (let key of Object.keys(consts))
      script.constants[key] = determRange(key, consts);
    
    let classnames = getMatches(text, /class\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*extends\s+/g, 1);
    const classes = findLineRanges(classnames, "class\\s+$X$\\s*extends\\s+");
    for (let key of Object.keys(classes))
      script.classes[key] = determRange(key, classes);

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
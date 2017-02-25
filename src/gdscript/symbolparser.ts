import {Range} from 'vscode';
import * as fs from 'fs';

interface GDScript {
  constants: {},
  functions: {},
  variables: {},
  signals: {},
  classes: {},
  base: string,
  native: string,
  signatures: {},
  // symbol: marked string
  documents: {},
  // name : value
  constvalues: {}
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
        native: "Object",
        signatures: {},
        documents: {},
        constvalues: {}
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
        if(Object.keys(sm).indexOf(name) != -1) return;
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

    const parseSignature = (range: Range):string => {
      let res = "";
      const line = lines[range.start.line];
      if(line.indexOf("(")!= -1 && line.indexOf(")")!=-1) {
        const signature = line.substring(line.indexOf("("), line.indexOf(")")+1);
        if(signature && signature.length >0)
          res = signature;
      }
      return res;
    };

    const parseDocument = (range: Range):string => {
      let mdoc = ""
      let line = range.start.line;
      while( line > 0){
        const linecontent = lines[line];
        let match = linecontent.match(/\s*#\s*(.*)/);
        const commentAtEnd = linecontent.match(/[\w'",\[\{\]\}\(\)]+\s*#\s*(.*)/);
        if(!match && line != range.start.line)
          break;
        if(commentAtEnd && line != range.start.line)
          break;
        if(match)
          mdoc = match[1] + "\r\n" + mdoc;
        else if(line != range.start.line)
          break
        --line;
      }
      return mdoc;
    }
    
    let funcsnames = getMatches(text, /func\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(/g, 1);
    const funcs = findLineRanges(funcsnames, "func\\s+$X$\\s*\\(");
    for (let key of Object.keys(funcs)) {
      let r: Range = determRange(key, funcs);
      script.functions[key] = r;
      script.signatures[key] = parseSignature(r);
      script.documents[key] = parseDocument(r);
    }
    
    let signalnames = getMatches(text, /signal\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*\(/g, 1);
    const signals = findLineRanges(signalnames, "signal\\s+$X$\\s*\\(");
    for (let key of Object.keys(signals)) {
      let r: Range = determRange(key, signals);
      script.signals[key] = r;
      script.signatures[key] = parseSignature(r);
      script.documents[key] = parseDocument(r);
    }

    let varnames = getMatches(text, /var\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/g, 1);
    const vars = findLineRanges(varnames, "var\\s+$X$\\s*");
    for (let key of Object.keys(vars)){
      const r:Range = determRange(key, vars)
      script.variables[key] = r;
      let newdoc = parseDocument(r);
      if(newdoc == "" && script.documents[key])
        newdoc = script.documents[key];
      script.documents[key] = newdoc;
    }
    
    let constnames = getMatches(text, /const\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*/g, 1);
    const consts = findLineRanges(constnames, "const\\s+$X$\\s*");
    for (let key of Object.keys(consts)){
      const r:Range = determRange(key, consts)
      script.constants[key] = r;
      let newdoc = parseDocument(r);
      if(newdoc == "" && script.documents[key])
        newdoc = script.documents[key];
      script.documents[key] = newdoc;
      
      const linecontent = lines[r.start.line];
      const match = linecontent.match(/const\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*=\s*([\w+]+\(.*\)|"[^"]*"|\-?\d+\.?\d*|\[.*\]|\{.*\})/);
      if(match && match.length && match.length >1)
        script.constvalues[key] = match[2];
    }
    
    let classnames = getMatches(text, /class\s+([_A-Za-z]+[_A-Za-z0-9]*)\s*extends\s+/g, 1);
    const classes = findLineRanges(classnames, "class\\s+$X$\\s*extends\\s+");
    for (let key of Object.keys(classes)) {
      const r:Range = determRange(key, classes)
      script.classes[key] = determRange(key, classes);
      script.documents[key] = parseDocument(r);
    }

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

import GDScriptSymbolParser from './gdscript/symbolparser';
import * as fs from 'fs';
import {CompletionItem, CompletionItemKind, TextEdit, Range} from 'vscode';

class Config {
  private symbols;
  private classes;
  public bintinSybmolInfoList: CompletionItem[];
  public parser: GDScriptSymbolParser;

  constructor() {
    this.symbols = {};
    this.bintinSybmolInfoList = [];
    this.parser = new GDScriptSymbolParser();
  }

  loadSymbolsFromFile(path) {
    const script = this.parser.parseFile(path);
    this.setSymbols(path, script);
    return script;
  }

  setSymbols(path, s) {
    this.symbols[path] = s;
  }

  getSymbols(path) {
    return this.symbols[path];
  }

  setAllSymbols(s) {
    this.symbols = s;
  }
  
  getAllSymbols() {
    return this.symbols;
  }

  normalizePath(path) {
    let newpath = path;
    if( path.indexOf(":") != -1){
      let parts = path.split(":");
      newpath = parts[0].toUpperCase()
      for(let i=1; i<parts.length; i++)
        newpath += parts[i].replace(/\\/g, "/");
    }
    return newpath;
  }

  loadClasses(docfile: string): boolean {
    let done: boolean = false;
    try {
      if(fs.existsSync(docfile) && fs.statSync(docfile).isFile()) {
        const content = fs.readFileSync(docfile, "utf-8");
        const docdata = JSON.parse(content);
        if(docdata.classes) {
          this.classes = docdata.classes;
          done = true;
        }
      }
    } catch (error) {
        console.error(error);
    }
    if(done) {
      for (let key of Object.keys(this.classes)) {
        const classdoc = this.classes[key];
        const bintinSybmolInfoList = this.bintinSybmolInfoList;
        // class
        const item: CompletionItem = new CompletionItem(classdoc.name, CompletionItemKind.Class);
        item.detail = 'Native Class';
        item.documentation = classdoc.brief_description + " \n\n" +classdoc.description;
        bintinSybmolInfoList.push(item);
        // methods
        const methods = classdoc.methods
        const parsMethod = (m, kind: CompletionItemKind, insertAction=(name)=>name+"()")=>{
          const mi = new CompletionItem(m.name, kind);
          mi.insertText = insertAction(m.name)
          mi.filterText = m.name
          mi.sortText = m.name
          mi.detail = `${classdoc.name}.${m.name}`;
          let argstr = "";
          m.arguments.map(arg=>{
            argstr += `${arg.type} ${arg.name}${arg.default_value.length>0?'='+arg.default_value.length:''}${m.arguments.indexOf(arg)==m.arguments.length-1?'':', '}`;
          });
          let mdoc = `${m.return_type} ${classdoc.name}.${m.name}(${argstr}) ${m.qualifiers}`;
          mdoc += " \n\n";
          mdoc += m.description;
          mi.documentation = mdoc;
          bintinSybmolInfoList.push(mi);
        };
        methods.map(m=>parsMethod(m, CompletionItemKind.Method));
        // signals
        const signals = classdoc.signals;
        signals.map(s=>parsMethod(s, CompletionItemKind.Interface, (name)=>`"${name}"`));
        // constants
        const constants = classdoc.constants;
        constants.map(c=>{
          const ci = new CompletionItem(c.name, CompletionItemKind.Enum);
          ci.detail = c.value;
          ci.documentation = `${classdoc.name}.${c.name} = ${c.value}`;
          bintinSybmolInfoList.push(ci);
        });
        
      }
    }

    return done;
  };

  getClass(name: string) {
    return this.classes[name];
  }

};

export default new Config();
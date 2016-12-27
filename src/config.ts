import GDScriptSymbolParser from './gdscript/symbolparser';
import * as fs from 'fs';
import {CompletionItem, CompletionItemKind, TextEdit, Range, workspace} from 'vscode';

interface NodeInfo {
  name: string,
  type: string,
  parent: string,
  instance: string
};

class Config {
  private symbols;
  private classes;
  public bintinSybmolInfoList: CompletionItem[];
  public parser: GDScriptSymbolParser;
  // scriptpath : scenepath
  public scriptSceneMap: Object;
  // scenepath : NodeInfo[]
  private nodeInfoMap: Object;

  constructor() {
    this.symbols = {};
    this.bintinSybmolInfoList = [];
    this.nodeInfoMap = {};
    this.scriptSceneMap = {};
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
    let newpath = path.replace(/\\/g, "/");
    if( path.indexOf(":") != -1){
      let parts = path.split(":");
      newpath = parts[0].toUpperCase()
      for(let i=1; i<parts.length; i++)
        newpath += parts[i];
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
        signals.map(s=>parsMethod(s, CompletionItemKind.Interface));
        // constants
        const constants = classdoc.constants;
        constants.map(c=>{
          const ci = new CompletionItem(c.name, CompletionItemKind.Enum);
          ci.detail = c.value;
          ci.documentation = `${classdoc.name}.${c.name} = ${c.value}`;
          bintinSybmolInfoList.push(ci);
        });
        // properties
        const properties = classdoc.properties;
        const parseProp = (p)=>{
          const pi = new CompletionItem(p.name, CompletionItemKind.Property);
          pi.detail = `${p.type} of ${classdoc.name}`;
          pi.documentation = p.description;
          bintinSybmolInfoList.push(pi);
        };
        properties.map(p=>parseProp(p));
        // theme_properties
        const theme_properties = classdoc.theme_properties;
        theme_properties.map(p=>parseProp(p));
      }
    }
    return done;
  };

  getWorkspaceCompletionItems(): CompletionItem[] {
      let items: CompletionItem[] = [];
      for (let path of Object.keys(this.symbols)) {
        const script = this.symbols[path];
        const addScriptItems = (items, kind: CompletionItemKind, kindName:string = "Symbol", insertText = (n)=>n)=>{
          const _items: CompletionItem[] = [];
          for (let name of Object.keys(items)) {
            const item = new CompletionItem(name, kind);
            item.detail = workspace.asRelativePath(path);
            item.insertText = insertText(name);
            item.documentation = `${kindName} defined in ${item.detail}`;
            _items.push(item);
          }
          return _items;
        }
        items = [...items, ...addScriptItems(script.classes, CompletionItemKind.Class, "Class")];
        items = [...items, ...addScriptItems(script.functions, CompletionItemKind.Method, "Method", (t)=>`${t}()`)];
        items = [...items, ...addScriptItems(script.variables, CompletionItemKind.Variable, "Variable")];
        items = [...items, ...addScriptItems(script.signals, CompletionItemKind.Interface, "Signal")];
        items = [...items, ...addScriptItems(script.constants, CompletionItemKind.Enum, "Constant")];
      }

      const addSceneNodes = ()=>{
        const _items: CompletionItem[] = [];
        for (let scnenepath of Object.keys(this.nodeInfoMap)) {
          const nodes: NodeInfo[] = this.nodeInfoMap[scnenepath];
          nodes.map((n=>{
            const item = new CompletionItem(n.name, CompletionItemKind.Reference);
            item.detail = n.type;
            item.documentation = `${n.parent}/${n.name} in ${scnenepath}`;
            _items.push(item);

            const fullitem = new CompletionItem(`${n.parent}/${n.name}`, CompletionItemKind.Reference);
            fullitem.detail = n.type;
            fullitem.filterText = n.name;
            fullitem.sortText = n.name;
            fullitem.documentation = `${n.parent}/${n.name} in ${scnenepath}`;
            _items.push(fullitem);
          }));
        }
        return _items;
      };
      items = [...items, ...addSceneNodes()];

      return items;
  }

  loadScene(scenePath: string) {
    console.log(scenePath);
    if(fs.existsSync(scenePath) && fs.statSync(scenePath).isFile()) {
      try {
        const content: string = fs.readFileSync(scenePath, 'utf-8');
        if(content) {
          // extern resources
          const exteres = {};
          let reg = /ext_resource path="res:\/\/(.*)" type="(.*)" id=(\d+)/g;
          let match = reg.exec(content);
          while (match != null) {
            const path = match[1];
            const type = match[2];
            const id = match[3];
            exteres[id] = {path, type};
            if (type == "Script") {
              let workspacescenepath = scenePath;
              if(workspace)
                workspacescenepath = workspace.asRelativePath(scenePath);
              this.scriptSceneMap[path] = workspacescenepath;
            }
            match = reg.exec(content);
          }
          // nodes
          const nodes: NodeInfo[] = [];
          reg = /node\s+name="(.*)"\s+type="(.*)"\s+parent="(.*)"/g;
          match = reg.exec(content);
          while (match != null) {
            nodes.push({
              name : match[1],
              type : match[2],
              parent : match[3],
              instance: ""
            });
            match = reg.exec(content);
          }
          // packed scenes
          reg = /node name="(.*)" parent="(.*)" instance=ExtResource\(\s*(\d+)\s*\)/g;
          match = reg.exec(content);
          while (match != null) {
            const id = match[3];
            nodes.push({
              name : match[1],
              type : exteres[id].type,
              parent : match[2],
              instance: exteres[id].path
            });
            match = reg.exec(content);
          }
          if(workspace)
            scenePath = workspace.asRelativePath(scenePath);
          this.nodeInfoMap[scenePath] = nodes;
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  getClass(name: string) {
    return this.classes[name];
  }

};

export default new Config();
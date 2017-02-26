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
  public nodeInfoMap: Object;
  // symbolname: {completionItem: CompletionItem, rowDoc: docdata}
  public builtinSymbolInfoMap: Object;

  constructor() {
    this.symbols = {};
    this.bintinSybmolInfoList = [];
    this.builtinSymbolInfoMap = {};
    this.nodeInfoMap = {};
    this.scriptSceneMap = {};
    this.parser = new GDScriptSymbolParser();
  }

  loadSymbolsFromFile(path) {
    var ignoreIndentedVars = false;
    if(workspace)
      ignoreIndentedVars = workspace.getConfiguration("GodotTools").get("ignoreIndentedVars", false);
    const script = this.parser.parseFile(path, ignoreIndentedVars);
    this.setSymbols(path, script);
    return script;
  }

  setSymbols(path, s) {
    this.symbols[this.normalizePath(path)] = s;
  }

  getSymbols(path) {
    return this.symbols[this.normalizePath(path)];
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
      newpath = parts[0].toUpperCase();
      newpath += ":";
      for(let i=1; i<parts.length; i++)
        newpath += parts[i];
    }
    newpath = newpath.replace(/\\/g, "/");
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
        const builtinSymbolInfoMap = this.builtinSymbolInfoMap;
        // class
        const item: CompletionItem = new CompletionItem(classdoc.name, CompletionItemKind.Class);
        item.detail = 'Native Class';
        item.documentation = classdoc.brief_description + " \n\n" +classdoc.description;
        bintinSybmolInfoList.push(item);
        builtinSymbolInfoMap[classdoc.name] = {completionItem: item, rowDoc: classdoc};
        // methods
        const methods = classdoc.methods
        const parsMethod = (m, kind: CompletionItemKind, insertAction=(name)=>name)=>{
          const mi = new CompletionItem(m.name, kind);
          mi.insertText = insertAction(m.name) + (m.arguments.length==0?"()":"");
          mi.filterText = m.name
          mi.sortText = m.name
          mi.detail = m.return_type;
          let argstr = "";
          m.arguments.map(arg=>{
            argstr += `${arg.type} ${arg.name}${arg.default_value.length>0?'='+arg.default_value.length:''}${m.arguments.indexOf(arg)==m.arguments.length-1?'':', '}`;
          });
          // mi.label=`${m.name}(${argstr}) ${m.qualifiers}`;
          let mdoc = `${m.return_type} ${classdoc.name}.${m.name}(${argstr}) ${m.qualifiers}`;
          mdoc += " \n\n";
          mdoc += m.description;
          mi.documentation = mdoc;
          bintinSybmolInfoList.push(mi);
          builtinSymbolInfoMap[`${classdoc.name}.${m.name}`] = {completionItem: mi, rowDoc: m};
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
          builtinSymbolInfoMap[`${classdoc.name}.${c.name}`] = {completionItem: ci, rowDoc: c};
        });
        // properties
        const properties = classdoc.properties;
        const parseProp = (p)=>{
          const pi = new CompletionItem(p.name, CompletionItemKind.Property);
          pi.detail = `${p.type} of ${classdoc.name}`;
          pi.documentation = p.description;
          bintinSybmolInfoList.push(pi);
          builtinSymbolInfoMap[`${classdoc.name}.${p.name}`] = {completionItem: pi, rowDoc: p};
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
            const signature = (script.signatures && script.signatures[name])?script.signatures[name]:"";
            const cvalue = (script.constvalues && script.constvalues[name])?script.constvalues[name]:""; 
            const item = new CompletionItem(name+signature, kind);
            item.sortText = name;
            item.filterText = name;
            item.detail = cvalue;
            item.insertText = insertText(name) + (signature=="()"?"()":"");
            item.documentation = (script.documents && script.documents[name])?script.documents[name]+"\r\n":"";
            item.documentation += `${kindName} defined in ${workspace.asRelativePath(path)}`;
            _items.push(item);
          }
          return _items;
        }
        items = [...items, ...addScriptItems(script.classes, CompletionItemKind.Class, "Class")];
        items = [...items, ...addScriptItems(script.functions, CompletionItemKind.Method, "Method")];
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

  getBuiltinClassNameList() {
    let namelist = null;
    if(this.classes)
      namelist = Object.keys(this.classes);
    if(!namelist)
      namelist = [];
    return namelist;
  }

};

export default new Config();

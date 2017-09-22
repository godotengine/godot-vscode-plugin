import GDScriptSymbolParser from './gdscript/symbolparser';
import * as fs from 'fs';
import {CompletionItem, CompletionItemKind, TextEdit, Range, workspace} from 'vscode';

interface NodeInfo {
  name: string,
  type: string,
  parent: string,
  instance: string
};

interface CompletionSymbols  {
  classes : CompletionItem[],
  functions : CompletionItem[],
  signals : CompletionItem[],
  constants : CompletionItem[],
  properties : CompletionItem[],
  nodes : CompletionItem[],
  builtinConstants: CompletionItem[]
};

class Config {
  
  private workspaceSymbols; // filePath: GDScript in symbolparser.ts
  private builtinCompletions : CompletionSymbols;
  private builtinClassDoc;
  public parser: GDScriptSymbolParser;
  // scriptpath : scenepath
  public scriptSceneMap: Object;
  // scenepath : NodeInfo[]
  public nodeInfoMap: Object;
  // symbolname: {completionItem: CompletionItem, rowDoc: docdata}
  public builtinSymbolInfoMap: Object;

  constructor() {
    this.builtinCompletions = {
      classes : [],
      functions : [],
      signals : [],
      constants : [],
      properties : [],
      nodes : [],
      builtinConstants: []
    };
    this.workspaceSymbols = {};
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
    this.workspaceSymbols[this.normalizePath(path)] = s;
  }

  getSymbols(path) {
    return this.workspaceSymbols[this.normalizePath(path)];
  }

  setAllSymbols(s) {
    this.workspaceSymbols = s;
  }
  
  getAllSymbols() {
    return this.workspaceSymbols;
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
          this.builtinClassDoc = docdata.classes;
          done = true;
        }
      }
    } catch (error) {
        console.error(error);
    }
    if(done) {
      for (let key of Object.keys(this.builtinClassDoc)) {
        const classdoc = this.builtinClassDoc[key];
        const builtinSymbolInfoMap = this.builtinSymbolInfoMap;
        // ----------------------  class -----------------
        const item: CompletionItem = new CompletionItem(classdoc.name, CompletionItemKind.Class);
        item.detail = 'Native Class';
        item.documentation = classdoc.brief_description + " \n\n" +classdoc.description;
        this.builtinCompletions.classes.push(item);
        builtinSymbolInfoMap[classdoc.name] = {completionItem: item, rowDoc: classdoc};
        // ----------------------- functions -----------------------
        const parsMethod = (m, kind: CompletionItemKind, insertAction=(name)=>name)=>{
          const mi = new CompletionItem(m.name, kind);
          mi.insertText = insertAction(m.name) + (m.arguments.length==0?"()":"");
          mi.filterText = m.name
          mi.sortText = m.name
          mi.detail = m.return_type;
          let argstr = "";
          m.arguments.map(arg=>{
            argstr += `${arg.type} ${arg.name}${arg.default_value.length>0?'='+arg.default_value:''}${m.arguments.indexOf(arg)==m.arguments.length-1?'':', '}`;
          });
          // mi.label=`${m.name}(${argstr}) ${m.qualifiers}`;
          let methodName = `${classdoc.name}.${m.name}`;
          if (classdoc.name == m.name) methodName = m.name;
          let mdoc = `${m.return_type} ${methodName}(${argstr}) ${m.qualifiers}`;
          mdoc += " \n\n";
          mdoc += m.description;
          mi.documentation = mdoc;
          if(CompletionItemKind.Interface == kind)
            this.builtinCompletions.signals.push(mi);
          else
            this.builtinCompletions.functions.push(mi);
          builtinSymbolInfoMap[`${classdoc.name}.${m.name}`] = {completionItem: mi, rowDoc: m};
        };
        // methods
        const methods = classdoc.methods
        methods.map(m=>parsMethod(m, CompletionItemKind.Method));
        // signals
        const signals = classdoc.signals;
        signals.map(s=>parsMethod(s, CompletionItemKind.Interface));
        // ------------------------------ constants ---------------------
        const constants = classdoc.constants;
        constants.map(c=>{
          const ci = new CompletionItem(c.name, CompletionItemKind.Enum);
          ci.detail = c.value;
          ci.documentation = `${classdoc.name}.${c.name} = ${c.value}`;
          if(key[0] == "@" || key == "Node" || key == "Control")
            this.builtinCompletions.builtinConstants.push(ci);
          else
            this.builtinCompletions.constants.push(ci);
          builtinSymbolInfoMap[`${classdoc.name}.${c.name}`] = {completionItem: ci, rowDoc: c};
        });          
        // ----------------------- properties -----------------------
        const parseProp = (p) => {
          const pi = new CompletionItem(p.name, CompletionItemKind.Property);
          pi.detail = `${p.type} of ${classdoc.name}`;
          pi.documentation = p.description;
          this
            .builtinCompletions
            .properties
            .push(pi);
          builtinSymbolInfoMap[`${classdoc.name}.${p.name}`] = {
            completionItem: pi,
            rowDoc: p
          };
        };
        // properties
        const properties = classdoc.properties;
        properties.map(p=>parseProp(p));
        // theme_properties
        const theme_properties = classdoc.theme_properties;
        theme_properties.map(p=>parseProp(p));
      }
    }
    return done;
  };

  getWorkspaceCompletionItems(script_files = []) : CompletionSymbols {
      const symbols = {
        classes: [],
        functions: [],
        signals: [],
        constants: [],
        properties: [],
        nodes: [],
        builtinConstants: []
      };
      if (script_files.length == 0)
        script_files = Object.keys(this.workspaceSymbols);
      for (let path of script_files) {
        const script = this.workspaceSymbols[path];
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

        symbols.classes = [ ...(symbols.classes), ...(addScriptItems(script.classes, CompletionItemKind.Class, "Class"))]
        symbols.functions = [ ...(symbols.functions), ...(addScriptItems(script.functions, CompletionItemKind.Method, "Method"))]
        symbols.signals = [ ...(symbols.signals), ...(addScriptItems(script.signals, CompletionItemKind.Interface, "Signal"))]
        symbols.properties = [ ...(symbols.properties), ...(addScriptItems(script.variables, CompletionItemKind.Variable, "Variable"))]
        symbols.constants = [ ...(symbols.constants), ...(addScriptItems(script.constants, CompletionItemKind.Enum, "Constant"))]
        
        if(script.enumerations)
          symbols.constants = [...(symbols.constants), ...(addScriptItems(script.enumerations, CompletionItemKind.Enum, "Enumeration"))];
      }
      
      if(workspace.getConfiguration("GodotTools").get("completeNodePath", false)) {
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
        symbols.nodes = [...(symbols.nodes), ...(addSceneNodes())];
      }

      return symbols;
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
    return this.builtinClassDoc[name];
  }

  getBuiltinCompletions() {
    return this.builtinCompletions;
  }

  getBuiltinClassNameList() {
    let namelist = null;
    if (this.builtinClassDoc)
      namelist = Object.keys(this.builtinClassDoc);
    if(!namelist)
      namelist = [];
    return namelist;
  }

};

export default new Config();
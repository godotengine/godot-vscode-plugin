import * as vscode from 'vscode';
import godotRequest from './request';
import GDScriptSymbolProvider from './gdscript/symbolprovider';
import GDScriptWorkspaceSymbolProvider from './gdscript/workspace_symbol_provider';
import GDScriptCompletionItemProvider from './gdscript/completion';
import GDScriptDefinitionProivder from './gdscript/definitionprovider';
import GDScriptHoverProvider from './gdscript/hoverprovider';
import GDScriptDocumentContentProvider from './gdscript/docprovider';

var glob = require("glob")
import config from './config';
import * as path from 'path';
import * as fs from 'fs';
const cmd = require('node-cmd');

class ToolManager {

  private workspaceDir: string = "";
  private symbolprovider: GDScriptSymbolProvider = null;
  private workspacesymbolprovider: GDScriptWorkspaceSymbolProvider = null;
  private _disposable: vscode.Disposable;
  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this.workspaceDir = vscode.workspace.rootPath;
    if(vscode.workspace && this.workspaceDir) {
      vscode.workspace.registerTextDocumentContentProvider('godotdoc', new GDScriptDocumentContentProvider());
      this.workspaceDir = this.workspaceDir.replace(/\\/g, "/");
      this.loadWorkspaceSymbols();
    }
    if(0) { // TODO: EditorServer validate
      this.validate();
    }
    this.loadClasses();
    // documentation symbol provider
    this.symbolprovider = new GDScriptSymbolProvider();
    vscode.languages.registerDocumentSymbolProvider('gdscript', this.symbolprovider);
    // workspace symbol provider
    this.workspacesymbolprovider = new GDScriptWorkspaceSymbolProvider();
    vscode.languages.registerWorkspaceSymbolProvider(this.workspacesymbolprovider);
    // definition provider
    vscode.languages.registerDefinitionProvider('gdscript', new GDScriptDefinitionProivder());
    // hover provider
    vscode.languages.registerHoverProvider('gdscript', new GDScriptHoverProvider());
    // code completion provider
    vscode.languages.registerCompletionItemProvider('gdscript', new GDScriptCompletionItemProvider(), '.', '"', "'");
    // Commands
    this._disposable = vscode.Disposable.from(
      vscode.commands.registerCommand('godot.updateWorkspaceSymbols', this.loadWorkspaceSymbols.bind(this)),
      vscode.commands.registerCommand('godot.runWorkspace', ()=>{this.openWorkspaceWithEditor()}),
      vscode.commands.registerCommand('godot.openWithEditor', ()=>{this.openWorkspaceWithEditor("-e")}),
      vscode.commands.registerCommand('godot.runCurrentScene', this.runCurrentScenr.bind(this))
    );
  }

  validate() {
    const self = this;
    godotRequest({action: "editor", command: "projectdir"}).then((res: any)=>{
      let path = res.path;
      if(path && path.length> 0 && path.endsWith("/"))
        path = path.substring(0, path.length-1)
      if( path.toLowerCase() == self.workspaceDir.toLowerCase())
        vscode.window.showInformationMessage("Connected to godot editor server");
      else {
        vscode.window.showWarningMessage("The opened project is not same with godot editor");
      }
    }).catch(e=>{
        vscode.window.showErrorMessage("Failed connect to godot editor server");
    });
  }

  loadAllSymbols(): Promise<any> {
    const self = this;
    return new Promise((resolve, reject) => {
      glob( self.workspaceDir +"/**/*.gd", (err, files)=>{
        if(!err) {
          const symbols = {};
          for(let i=0; i< files.length; i++)
            symbols[files[i]] = config.loadSymbolsFromFile(files[i]);
          // load autoloads from engin.cfg
          const engincfg = path.join(self.workspaceDir, "engine.cfg");
          if(fs.existsSync(engincfg) && fs.statSync(engincfg).isFile()) {
            try {
              const script = { constants: {}, functions: {}, variables: {}, signals: {}, classes: {}, base: "Object", native: "Object"};
              let content: string = fs.readFileSync(engincfg, 'utf-8');
              if(content && content.indexOf("[autoload]") != -1) {
                content = content.substring(content.indexOf("[autoload]")+"[autoload]".length, content.length);
                content = content.substring(0, content.indexOf("["));
                const lines = content.split(/\r?\n/);
                lines.map(l=>{
                  if(l.indexOf("=") != 0) {
                    const name = l.substring(0, l.indexOf("="));
                    script.constants[name] = new vscode.Range(0, 0, 0,0);
                  }
                });
              }
              symbols["autoload"] = script;
            } catch (error) {
              console.error(error);       
            }
          }
          resolve(symbols);
        }
        else
          reject(err);
      });
    });
  }

  private loadAllNodesInWorkspace() {
    glob( this.workspaceDir +"/**/*.tscn", (err, files)=>{
      if(!err) {
        const symbols = {};
        for(let i=0; i< files.length; i++)
          config.loadScene(files[i]);
      }
    });
  }

  private loadWorkspaceSymbols() {
    this.loadAllNodesInWorkspace();
    this.loadAllSymbols().then(symbols=>{
        vscode.window.showInformationMessage("Update GDScript symbols done");
        config.setAllSymbols(symbols);
    }).catch(e=>{
        vscode.window.showWarningMessage("Update GDScript symbols failed");
    });
  }

  private openWorkspaceWithEditor(params="") {
    let workspaceValid = false
    if(this.workspaceDir) {
      let cfg = path.join(this.workspaceDir, "engine.cfg");
      if( fs.existsSync(cfg) && fs.statSync(cfg).isFile())
        workspaceValid = true;
    }
    if(workspaceValid)
      this.runEditor(`-path ${this.workspaceDir} ${params}`);
    else
      vscode.window.showErrorMessage("Current workspace is not a godot project");
  }

  private runEditor(params="") {
    const editorPath = vscode.workspace.getConfiguration("GodotTools").get("editorPath", "")
    if(!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
      vscode.window.showErrorMessage("Invalid editor path to run the project");
    }
    else {
      cmd.run(`${editorPath} ${params}`);
    }
  }

  private runCurrentScenr() {
    let scenePath = null
    if(vscode.window.activeTextEditor)
      scenePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);
    if(scenePath.endsWith(".gd"))
      scenePath = config.scriptSceneMap[config.normalizePath(scenePath)];
    if(scenePath && (scenePath.endsWith(".tscn") || scenePath.endsWith(".scn"))) {
      scenePath = ` res://${scenePath} `;
      this.openWorkspaceWithEditor(scenePath);
    }
    else
      vscode.window.showErrorMessage("Current document is not a scene file");
  }

  loadClasses() {
    let done :boolean = false;
    if(this.workspaceDir)
      done = config.loadClasses(path.join(this.workspaceDir, ".vscode", "classes.json"));
    if(!done)
      done = config.loadClasses(path.join(this._context.extensionPath, "doc", "classes.json"));
    if(!done)
      vscode.window.showErrorMessage("Load GDScript documentations failed");
  }

  dispose() {
    this._disposable.dispose();
  }
};

export default ToolManager;

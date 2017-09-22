import * as vscode from 'vscode';
import godotRequest from './request';
import GDScriptSymbolProvider from './gdscript/symbolprovider';
import GDScriptWorkspaceSymbolProvider from './gdscript/workspace_symbol_provider';
import GDScriptCompletionItemProvider from './gdscript/completion';
import GDScriptDefinitionProivder from './gdscript/definitionprovider';
import GDScriptHoverProvider from './gdscript/hoverprovider';
import GDScriptDocumentContentProvider from './gdscript/docprovider';
import GDScriptSignatureHelpProvider from './gdscript/signature_helper';
var glob = require("glob")
import config from './config';
import * as path from 'path';
import * as fs from 'fs';
class ToolManager {

  private workspaceDir: string = "";
  private symbolprovider: GDScriptSymbolProvider = null;
  private workspacesymbolprovider: GDScriptWorkspaceSymbolProvider = null;
  private _disposable: vscode.Disposable;
  private _context: vscode.ExtensionContext;
  private _projectFile : string = "engine.cfg";
  private _rootDir : string = "";
  private _biuitinDocFile : string = "doc/classes-2.1.json";

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this.workspaceDir = vscode.workspace.rootPath;
    let completionDollar = false;
    if (vscode.workspace.getConfiguration("GodotTools").get("godotVersion", 2.1) >= 3) {
      this._projectFile = "project.godot";
      this._biuitinDocFile = "doc/classes-3.0.json";
      completionDollar = true;
    }
    if (vscode.workspace && this.workspaceDir) {
      vscode.workspace.registerTextDocumentContentProvider('godotdoc', new GDScriptDocumentContentProvider());
      this.workspaceDir = this.workspaceDir.replace(/\\/g, "/");
      this.loadWorkspaceSymbols();
    }
    this._rootDir = vscode.workspace.getConfiguration("GodotTools").get("godotProjectRoot", this.workspaceDir);
    this._rootDir = this._rootDir.replace("${workspaceRoot}", this.workspaceDir);

    this.loadClasses();
    // documentation symbol provider
    this.symbolprovider = new GDScriptSymbolProvider();
    vscode.languages.registerDocumentSymbolProvider('gdscript', this.symbolprovider);
    // workspace symbol provider
    this.workspacesymbolprovider = new GDScriptWorkspaceSymbolProvider();
    vscode.languages.registerWorkspaceSymbolProvider(this.workspacesymbolprovider);
    // definition provider
    vscode.languages.registerDefinitionProvider('gdscript', new GDScriptDefinitionProivder(this._rootDir));
    // hover provider
    vscode.languages.registerHoverProvider('gdscript', new GDScriptHoverProvider());
    // code completion provider
    if (completionDollar)
      vscode.languages.registerCompletionItemProvider('gdscript', new GDScriptCompletionItemProvider(), '.', '"', "'", "$");
    else
      vscode.languages.registerCompletionItemProvider('gdscript', new GDScriptCompletionItemProvider(), '.', '"', "'");
    // signature help provider
    vscode.languages.registerSignatureHelpProvider('gdscript', new GDScriptSignatureHelpProvider(), '(', ',');
    // Commands
    this._disposable = vscode.Disposable.from(
      vscode.commands.registerCommand('godot.updateWorkspaceSymbols', this.loadWorkspaceSymbols.bind(this)),
      vscode.commands.registerCommand('godot.runWorkspace', () => { this.openWorkspaceWithEditor() }),
      vscode.commands.registerCommand('godot.openWithEditor', () => { this.openWorkspaceWithEditor("-e") }),
      vscode.commands.registerCommand('godot.runCurrentScene', this.runCurrentScene.bind(this)),
    );
  }

  validate() {
    const self = this;
    godotRequest({
      action: "editor",
      command: "projectdir"
    }).then((res: any) => {
      let path = res.path;
      if (path && path.length > 0 && path.endsWith("/"))
        path = path.substring(0, path.length - 1)
      if (path.toLowerCase() == self.workspaceDir.toLowerCase())
        vscode.window.showInformationMessage("Connected to godot editor server");
      else {
        vscode.window.showWarningMessage("The opened project is not same with godot editor");
      }
    }).catch(e => {
      vscode.window.showErrorMessage("Failed connect to godot editor server");
    });
  }

  loadAllSymbols(): Promise < any > {
    const self = this;
    return new Promise((resolve, reject) => {
      glob(self.workspaceDir + "/**/*.gd", (err, files) => {
        if (!err) {
          const symbols = {};
          for (let i = 0; i < files.length; i++)
            symbols[config.normalizePath(files[i])] = config.loadSymbolsFromFile(files[i]);
          // load autoloads from engin.cfg
          const engincfg = path.join(self.workspaceDir, this._projectFile);
          if (fs.existsSync(engincfg) && fs.statSync(engincfg).isFile()) {
            try {
              const script = {
                constants: {},
                functions: {},
                variables: {},
                signals: {},
                classes: {},
                base: "Object",
                native: "Object",
                constpathes: {},
                documents: {},
                constvalues: {}
              };
              let content: string = fs.readFileSync(engincfg, 'utf-8');
              if (content && content.indexOf("[autoload]") != -1) {
                content = content.substring(content.indexOf("[autoload]") + "[autoload]".length, content.length);
                content = content.substring(0, content.indexOf("["));
                const lines = content.split(/\r?\n/);
                lines.map((l) => {
                  if (l.indexOf("=") != 0) {
                    const name = l.substring(0, l.indexOf("="));

                    let gdpath = l.substring(l.indexOf("res://") + "res://".length, l.indexOf(".gd") + ".gd".length);
                    gdpath = path.join(this._rootDir, gdpath);
                    let showgdpath = vscode.workspace.asRelativePath(gdpath);

                    let doc = "Auto loaded instance of " + `[${showgdpath}](${vscode.Uri.file(gdpath).toString()})`;
                    doc = doc.replace(/"/g, " ");

                    script.constants[name] = new vscode.Range(0, 0, 0, 0);
                    script.constvalues[name] = "autoload";
                    script.documents[name] = doc;
                    script.constpathes[name] = gdpath;
                  }
                });
              }
              symbols["autoload"] = script;
            } catch (error) {
              console.error(error);
            }
          }
          resolve(symbols);
        } else
          reject(err);
      });
    });
  }

  private loadAllNodesInWorkspace() {
    glob(this.workspaceDir + "/**/*.tscn", (err, files) => {
      if (!err) {
        const symbols = {};
        for (let i = 0; i < files.length; i++)
          config.loadScene(files[i]);
      }
    });
  }

  private loadWorkspaceSymbols() {
    if (vscode.workspace.getConfiguration("GodotTools").get("parseTextScene", false)) {
      this.loadAllNodesInWorkspace();
    }
    this.loadAllSymbols().then(symbols => {
      vscode.window.setStatusBarMessage("$(check) Workspace symbols", 5000);
      config.setAllSymbols(symbols);
    }).catch(e => {
      vscode.window.setStatusBarMessage("$(x) Workspace symbols", 5000);
    });
  }

  private openWorkspaceWithEditor(params = "") {
    let workspaceValid = false
    if (this.workspaceDir) {
    let cfg = path.join(this._rootDir, this._projectFile);
    if (fs.existsSync(cfg) && fs.statSync(cfg).isFile())
        workspaceValid = true;
    }
    if (workspaceValid) {
      let pathFlag = "-path";
      if (vscode.workspace.getConfiguration("GodotTools").get("godotVersion", 2.1) >= 3)
        pathFlag = "--path";
      this.runEditor(`${pathFlag} ${this._rootDir} ${params}`);
    }
    else
      vscode.window.showErrorMessage("Current workspace is not a godot project");
  }

  private runEditor(params = "") {
    let editorPath = vscode.workspace.getConfiguration("GodotTools").get("editorPath", "")
    editorPath = editorPath.replace("${workspaceRoot}", this.workspaceDir);
    if (!fs.existsSync(editorPath) || !fs.statSync(editorPath).isFile()) {
      vscode.window.showErrorMessage("Invalid editor path to run the project");
    } else {
      let terminal = vscode.window.createTerminal("Godot");
      let cmmand = `${editorPath} ${params}`;
      terminal.sendText(cmmand, true);
      terminal.show();
    }
  }

  private runCurrentScene() {
    const absFilePath = vscode.window.activeTextEditor.document.uri.fsPath;
    let scenePath = null
    if (vscode.window.activeTextEditor) {
      scenePath = path.relative(this._rootDir, absFilePath);
      scenePath = scenePath.replace(/\\/g, "/");
    }
    // Run scripts directly which is inhired from SceneTree or MainLoop
    if (scenePath.endsWith(".gd")) {
      const scriptPath = scenePath;
      scenePath = config.scriptSceneMap[config.normalizePath(scenePath)];
      if (!scenePath) {
        const script = config.loadSymbolsFromFile(absFilePath);
        if (script) {
          if(script.native == "SceneTree" || script.native == "MainLoop") {
            this.runEditor(`-s ${scriptPath}`);
            return;
          }
        }
      }
    }
    if (scenePath) {
      if (scenePath.endsWith(".gd"))
        scenePath = ` -s res://${scenePath} `;
      else
        scenePath = ` res://${scenePath} `;
      this.openWorkspaceWithEditor(scenePath);
    } else
      vscode.window.showErrorMessage("Current document is not a scene file or MainLoop");
  }

  loadClasses() {
    let done: boolean = false;
    if (this.workspaceDir)
      done = config.loadClasses(path.join(this.workspaceDir, ".vscode", "classes.json"));
    if (!done)
      done = config.loadClasses(path.join(this._context.extensionPath, this._biuitinDocFile));
    if (!done)
      vscode.window.showErrorMessage("Load GDScript documentations failed");
  }

  dispose() {
    this._disposable.dispose();
  }
};

export default ToolManager;

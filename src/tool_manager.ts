import * as vscode from 'vscode';
import DocDataManager from './docdata';
import godotRequest from './request';

class ToolManager {

  private workspaceDir: string = "";
  private docs: DocDataManager = null;
  
  constructor(context: vscode.ExtensionContext) {
    this.workspaceDir = vscode.workspace.rootPath;
    this.validate();
    this.docs = new DocDataManager(context.extensionPath);
  }

  validate() {
    const self = this;
    godotRequest({action: "editor", command: "projectdir"}).then((res: any)=>{
      let path = res.path;
      if(path && path.length> 0 && path.endsWith("/"))
        path = path.substring(0, path.length-1)
      if( path == self.workspaceDir)
        vscode.window.showInformationMessage("Connected to godot editor server");
      else {
        vscode.window.showWarningMessage("The opened project is not same with godot editor");
      }
    }).catch(e=>{
        vscode.window.showErrorMessage("Failed connect to godot editor server");
    });
  }

  dispose() {

  }
};

export default ToolManager;
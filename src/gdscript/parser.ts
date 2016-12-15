import requestGodot from "../request";
import * as vscode from 'vscode';
import {DiagnosticCollection, DiagnosticSeverity} from 'vscode';
interface GDParseError {
  message: string,
  column: number,
  row: number
}

interface GDScript {
  members: {
    constants: {},
    functions: {},
    variables: {},
    signals: {}
  },
  base: string,
  errors: GDParseError[],
  valid: boolean,
  is_tool: boolean,
  native: string
}

interface ParseRequest {
  text: string,
  path: string
}



class GDParser {
  private _subscription: DiagnosticCollection;
  
  constructor() {
    this._subscription = vscode.languages.createDiagnosticCollection("gdscript")
  }

  dispose() {
    this._subscription.dispose()
  }

  private parseGDScript(script: GDScript, request: ParseRequest) {
    // console.log("Parse GDScript ", script);
    let canonicalFile = vscode.Uri.file(request.path);
    this._subscription.delete(canonicalFile)
    if(script.valid) { // Parse symbols
      
    }
    if(script.errors.length != 0 ) { // Parse errors
        let diagnostics = [];
        script.errors.map( error => {
          let range = new vscode.Range(error.row-1, error.column, error.row-1, error.row + 10);
          diagnostics.push(new vscode.Diagnostic(range, error.message, DiagnosticSeverity.Error));
        });
        this._subscription.set(canonicalFile, diagnostics);
    }
  }

  parseDocument(doc: vscode.TextDocument) {
    if(doc.languageId == 'gdscript') {
      // console.log('[GodotTools]:start parsing document ', doc);
      const self = this;
      const request: ParseRequest = {text: doc.getText(), path: doc.fileName};
      requestGodot({action: "parsescript",request}).then((data: any)=>{
            const result: GDScript = data.result;
            if(result && vscode.window.activeTextEditor.document == doc){
              self.parseGDScript(result, request);
            }
        }).catch(e=>{
            console.error(e);
        });
    }
  }
  
}

export default GDParser;
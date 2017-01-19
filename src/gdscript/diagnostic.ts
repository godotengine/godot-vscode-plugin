import requestGodot from "../request";
import * as vscode from 'vscode';
import {DiagnosticCollection, DiagnosticSeverity} from 'vscode';
import config from '../config';

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



class GDScriptDiagnosticSeverity {
  private _subscription: DiagnosticCollection;
  
  constructor() {
    this._subscription = vscode.languages.createDiagnosticCollection("gdscript")
  }

  dispose() {    
    this._subscription.dispose()
  }

  async validateScript(doc: vscode.TextDocument, script: any) {
    if(doc.languageId == 'gdscript') {
      if(script) {
        let diagnostics = [
          ...(this.validateExpression(doc)),
          ...(this.validateUnusedSymbols(doc, script)),
        ];
        this._subscription.set(doc.uri, diagnostics);
        return true;
      }
    }
    return false;
  }

  private validateUnusedSymbols(doc: vscode.TextDocument,script) {
    let diagnostics = [];
    const text = doc.getText();
    
    const check = (name:string, range: vscode.Range) => {
      var matchs = text.match(new RegExp(`[^0-9A-Za-z_]\\s*${name}[^0-9A-Za-z_]\\s*`, 'g'));
      let count = matchs?matchs.length:0;
      var incomment = text.match(new RegExp(`#[^0-9A-z_]*${name}[^0-9A-z_]`, 'g'));
      count -= incomment?incomment.length:0;
      if(count <= 1)
        diagnostics.push(new vscode.Diagnostic(range, `${name} is never used.`, DiagnosticSeverity.Warning));
    };
    // Unused variables
    for (let key of Object.keys(script.variables))
      check(key, script.variables[key]);
    for (let key of Object.keys(script.constants))
      check(key, script.constants[key]);
    return diagnostics;
  }

  private validateExpression(doc: vscode.TextDocument) {
    let diagnostics = [];
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    lines.map((line:string, i: number) =>{
      let matchstart = /[^\s]+.*/.exec(line);
      let curLineStartAt = 0;
      if(matchstart)
        curLineStartAt = matchstart.index;
      
      // normalize line content
      line = "\t" + line + "\t";

      if(line.match(/[^#].*?\;/) && !line.match(/[#].*?\;/)) {
        const semicolonIndex = line.indexOf(';');
        diagnostics.push(new vscode.Diagnostic(new vscode.Range(i, semicolonIndex, i, semicolonIndex+1), "Statement contains a semicolon.", DiagnosticSeverity.Warning));
      }
      if(line.match(/[^\w](if|elif|else|for|while|func|class)[^\w].*?/) && !line.match(/#.*?[^\w](if|elif|else|for|while|func|class)[^\w].*?/)) {
        var range = new vscode.Range(i, curLineStartAt, i, line.length);
        if(!line.match(/(if|elif|else|for|while|func|class).*?\:/))
          diagnostics.push(new vscode.Diagnostic(range, "':' expected at end of the line.", DiagnosticSeverity.Error));
        else if(line.match(/(if|elif|while|func|class)\s*\:/))
          diagnostics.push(new vscode.Diagnostic(range, "Indentifier expected before ':'", DiagnosticSeverity.Error));
        else if(line.match(/[^\w]for[^\w]/) && !line.match(/\s+for\s\w+\s+in\s+\w+/))
          diagnostics.push(new vscode.Diagnostic(range, "Invalid for expression", DiagnosticSeverity.Error));
        else if(line.match(/(if|elif|while)\s*\(.*\)/))
          diagnostics.push(new vscode.Diagnostic(range, "Extra brackets in condition expression.", DiagnosticSeverity.Warning));
        
        if( i < lines.length-1) {
          const nextline = lines[i+1];
          let nextLineStartAt = -1;
          let match = /[^\s]+.*/.exec(nextline);
          if(match)
            nextLineStartAt = match.index;
          
          if(nextLineStartAt <= curLineStartAt)
              diagnostics.push(new vscode.Diagnostic(range, "Expected indented block after expression", DiagnosticSeverity.Error));
        }
        else
          diagnostics.push(new vscode.Diagnostic(range, "Expected indented block after expression", DiagnosticSeverity.Error));
      }
    });
    return diagnostics;
  }
  
}

export default GDScriptDiagnosticSeverity;

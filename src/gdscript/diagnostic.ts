import requestGodot from "../request";
import * as vscode from 'vscode';
import {DiagnosticCollection, DiagnosticSeverity} from 'vscode';
import config from '../config';

interface GDParseError {
  message : string,
  column : number,
  row : number
}

interface GDScript {
  members : {
    constants: {},
    functions: {},
    variables: {},
    signals: {}
  },
  base : string,
  errors : GDParseError[],
  valid : boolean,
  is_tool : boolean,
  native : string
}

interface ParseRequest {
  text : string,
  path : string
}

class GDScriptDiagnosticSeverity {
  private _subscription : DiagnosticCollection;

  constructor() {
    this._subscription = vscode.languages.createDiagnosticCollection("gdscript")
  }

  dispose() {
    this._subscription.dispose()
  }

  async validateScript(doc : vscode.TextDocument, script : any) {
    if (doc.languageId == 'gdscript') {
      if (script) {
        let diagnostics = [ ...(this.validateExpression(doc)), ...(this.validateUnusedSymbols(doc, script)) ];
        this._subscription.set(doc.uri, diagnostics);
        return true;
      }
    }
    return false;
  }

  private validateUnusedSymbols(doc : vscode.TextDocument, script) {
    let diagnostics = [];
    let cfg : any = vscode.workspace.getConfiguration("GodotTools").get("lint");
    if (!cfg.unusedSymbols)
      return diagnostics

    const text = doc.getText();
    const check = (name : string, range : vscode.Range) => {
      var matchs = text.match(new RegExp(`([^\\w]|\\[|\\{)\\s*${name}\\s*([^\\w]|\\[|\\{)`, 'g'));
      let count = matchs ? matchs.length : 0;
      var incomment = text.match(new RegExp(`#.*?([^\\w]|\\[|\\{)\\s*${name}\\s*([^\\w]|\\[|\\{)`, 'g'));
      count -= incomment ? incomment.length : 0;
      if (count <= 1) 
        diagnostics.push(new vscode.Diagnostic(range, `${name} is never used.`, DiagnosticSeverity.Warning));
    };
    // Unused variables
    for (let key of Object.keys(script.variables)) 
      check(key, script.variables[key]);
    for (let key of Object.keys(script.constants)) 
      check(key, script.constants[key]);
    return diagnostics;
  }

  private validateExpression(doc : vscode.TextDocument) {
    let cfg : any = vscode.workspace.getConfiguration("GodotTools").get("lint");

    let diagnostics = [];
    let expectEndOfLine = false;
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    lines.map((line : string, i : number) => {
      let matchstart = /[^\s]+.*/.exec(line);
      let curLineStartAt = 0;
      if (matchstart) 
        curLineStartAt = matchstart.index;
      
      // ignore comments
      if (line.match(/^\s*#.*/) || line.match(/^#.*/)) 
        return
      // normalize line content
      line = "\t" + line + "\t";
      var range = new vscode.Range(i, curLineStartAt, i, line.length);

      if (cfg.semicolon && line.match(/[^#].*?\;/) && !line.match(/[#].*?\;/)) {
        const semicolonIndex = line.indexOf(';');
        diagnostics.push(new vscode.Diagnostic(new vscode.Range(i, semicolonIndex, i, semicolonIndex + 1), "Statement contains a semicolon.", DiagnosticSeverity.Warning));
      }
      if (line.match(/[^#].*?/) && expectEndOfLine) {
        if (!line.match(/.*?(\\|\:)/)) {
          diagnostics.push(new vscode.Diagnostic(range, "': or \\' expected at end of the line.", DiagnosticSeverity.Error));
          expectEndOfLine = false;
        }
        if (line.match(/.*?\:/)) 
          expectEndOfLine = false;
      }
      const colonKeywords = /\b(if|elif|else|for|while|func|class|match)\b/;
      let keywords = line.match(colonKeywords)
      if (keywords) {
        if(line.match(new RegExp(`".*?\\s${keywords[1]}\\s.*?"`)) || line.match(new RegExp(`'.*?\\s${keywords[1]}\\s.*?\'`)))
          return
        if(line.match(new RegExp(`.*?#.*?\\s${keywords[1]}\\s.*?`)))
          return
        if(line.match(/.*?\sif\s+(\!|\[|\{|\w).*?\s+else\s+[^\s]+/))
          return
        if (line.match(/.*?\\/))
          expectEndOfLine = true;
        else if (line.match(/.*?\:[\s+]+[^#\s]+/)) 
          return
        else if (!line.match(/.*?(\\|\:)/))
          diagnostics.push(new vscode.Diagnostic(range, "': or \\' expected at end of the line.", DiagnosticSeverity.Error));
        else if (line.match(/\s(if|elif|while|func|class|match)\s*\:/)) 
          diagnostics.push(new vscode.Diagnostic(range, "Indentifier expected before ':'", DiagnosticSeverity.Error));
        else if (line.match(/[^\w]for[^\w]/) && !line.match(/\s+for\s\w+\s+in\s+|[\w+]|\{.*?\}|\[.*?\]|\(.*?\)/)){
          if(!(line.match(/".*?for.*?"/) || line.match(/'.*?for.*?'/)))
            diagnostics.push(new vscode.Diagnostic(range, "Invalid for expression", DiagnosticSeverity.Error));
        }
        else if (cfg.conditionBrackets && line.match(/\s(if|elif|while|match)\s*\(.*\)\s*:\s*$/)) 
          diagnostics.push(new vscode.Diagnostic(range, "Extra brackets in condition expression.", DiagnosticSeverity.Warning));
        const blockIndetCheck = function() {
          const err = new vscode.Diagnostic(range, "Expected indented block after expression", DiagnosticSeverity.Error);
          if (i < lines.length - 1) {
            let next = i + 1;
            let nextline = lines[next];
            // changes nextline until finds a line containg text or comes to the last line
            while (((!nextline || !nextline.trim().length) || nextline.match(/^\s*#/)) && next < lines.length - 1) {
              ++next;
              nextline = lines[next];
            }
            let nextLineStartAt = -1;
            let match = /[^\s]+.*/.exec(nextline);
            if (match) 
              nextLineStartAt = match.index;
            
            if (nextLineStartAt <= curLineStartAt) 
              diagnostics.push(err);
          }
          else if(line.match(/\:\s*$/))
            diagnostics.push(err);
        };
        if(!expectEndOfLine)
          blockIndetCheck();
      }
      // Do not check : for end of statement as it breaks match statment
      let endOfStateMentWithComma = false;
      if(endOfStateMentWithComma && !line.match(colonKeywords) && line.match(/\:\s*$/)) {
        let showErr = true;
        if( i >= 1 ) {
          let previous = i - 1;
          let previousline = lines[previous];
          while(previousline.match(/\\\s*$/) && previous>=1) {
            --previous;
            const ppreviousline = lines[previous];
            if(ppreviousline.match(/\\\s*$/))
              previousline = ppreviousline;
          }
          const keywords = previousline.match(colonKeywords);
          if(keywords && !(previousline.match(new RegExp(`".*?\\s${keywords[1]}\\s.*?"`)) || previousline.match(new RegExp(`'.*?\\s${keywords[1]}\\s.*?'`)) ))
            showErr = false
        }
        if(showErr)
          diagnostics.push(new vscode.Diagnostic(range, "Expected end of statement after expression", DiagnosticSeverity.Error));
      }
      if (line.match(/(if|elif|while|return)\s+\w+\s*=\s*\w+/)) 
        diagnostics.push(new vscode.Diagnostic(range, "Assignment in condition or return expressions", DiagnosticSeverity.Warning));
      else if (line.indexOf("==") > 0 && !line.match(/\:\s*/)) {
        const endAt = line.indexOf("==");
        const precontent = line.substring(0, endAt);
      if (!precontent.match(/\s(if|elif|while|return)\s/) && !precontent.match(/=[^=]/) && !precontent.match(/assert\s*\(/) && !expectEndOfLine) {
          diagnostics.push(new vscode.Diagnostic(range, "Unhandled comparation expression contains", DiagnosticSeverity.Warning));
        }
      }
      let match = /var\s+(\w+)\s*=\s*(\w+)/.exec(line);
      if (match && match.length > 2 && match[1].length > 0 && match[1] == match[2]) {
        diagnostics.push(new vscode.Diagnostic(range, "Self Assignment may cause error.", DiagnosticSeverity.Warning));
      }
    });
    return diagnostics;
  }

}

export default GDScriptDiagnosticSeverity;

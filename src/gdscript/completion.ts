import {
  CompletionItemProvider,
  Position,
  TextDocument,
  CancellationToken,
  CompletionItem,
  CompletionList,
  languages,
  Disposable,
  CompletionItemKind
} from 'vscode';

import requestGodot from '../request';
import config from '../config';

interface CompleteRequest {
  path: string,
  text: string,
  cursor: {
    row: number,
    column: number
  }
}

interface CompletionResult {
  suggestions: string[],
  hint: string,
  prefix: string,
  valid: boolean
}

class GDScriptCompletionItemProvider implements CompletionItemProvider {

  constructor() {
  }

  private get_previous_flag(document : TextDocument, position : Position): string {
    const line = document.lineAt(position).text;
    let res = "";
    for (let index = position.character; index >= 0; index--) {
      res = line[index];
      if (['.', '$', '"', "'"].indexOf(res) != -1 )
        break;
    }
    return res;
  }

  provideCompletionItems(document : TextDocument, position : Position, token : CancellationToken) : CompletionItem[] | Thenable < CompletionItem[] > | CompletionList | Thenable < CompletionList > {
    
    const lastFlag = this.get_previous_flag(document, position);
    const builtins = config.getBuiltinCompletions();
    
    let items:CompletionItem[] = [...(builtins.builtinConstants)];
    if(!lastFlag || lastFlag.trim().length == 0) {
      const workspaces = config.getWorkspaceCompletionItems([config.normalizePath(document.fileName)]);
      items = [
        ...items,
        ...(workspaces.functions),
        ...(workspaces.classes),
        ...(workspaces.constants),
        ...(workspaces.properties),
        ...(builtins.functions),
        ...(builtins.classes),
      ]
    }
    else {
      const workspaces = config.getWorkspaceCompletionItems();
      if(lastFlag.trim() == ".") {
        items = [
          ...items,
          ...(workspaces.functions),
          ...(workspaces.constants),
          ...(workspaces.properties),
          ...(workspaces.classes),
          ...(builtins.functions),
          ...(builtins.constants),
          ...(builtins.properties)
        ]
      }
      else if(lastFlag.trim() == "'" || lastFlag.trim() == '"') {
        items = [
          ...items,
          ...(workspaces.signals),
          ...(workspaces.functions),
          ...(workspaces.properties),
          ...(builtins.signals),
          ...(builtins.functions),
          ...(builtins.properties),
          ...(workspaces.nodes),
        ]
      }
      else if(lastFlag.trim() == "$") {
        items = [ ...(workspaces.nodes) ]
      }
    }
    return items;
  }

  resolveCompletionItem(item : CompletionItem, token : CancellationToken) : CompletionItem | Thenable < CompletionItem > {
    return item;
  }

}

export default GDScriptCompletionItemProvider;
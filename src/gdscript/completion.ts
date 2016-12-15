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

  provideCompletionItems(document : TextDocument, position : Position, token : CancellationToken) : CompletionItem[] | Thenable < CompletionItem[] > | CompletionList | Thenable < CompletionList > {
    // console.log("[GodotTools]:provideCompletionItems");
    const request: CompleteRequest = {
      path: document.fileName,
      text: document.getText(),
      cursor: {
        row: position.line + 1,
        column: position.character + 1
      }
    };
    return new Promise((resolve, reject) => {
      requestGodot({
        action: "codecomplete",
        request
      }).then((data: any)=>{
        const result: CompletionResult = data.result;
        if(result && result.suggestions && result.suggestions.length > 0) {
          const items:CompletionItem[] = [];
          result.suggestions.map((label, i)=>{
            items.push(new CompletionItem(label, CompletionItemKind.Field));
          });
          resolve(items);
        }
        else
          reject("Nothing to complete");
      }).catch(e=>{
        reject(e);
      });
    });
  }

  resolveCompletionItem(item : CompletionItem, token : CancellationToken) : CompletionItem | Thenable < CompletionItem > {
    return item;
  }

}


class GDScriptCompleter {
  private _provider: Disposable;
  constructor() {
    this._provider = languages.registerCompletionItemProvider('gdscript',
      new GDScriptCompletionItemProvider(), 
      '.', '\'','\"','(', '_',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
			'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'
    );
  }

  dispose() {
    this._provider.dispose();
  }
}

export default GDScriptCompleter;
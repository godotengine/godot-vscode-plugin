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

  provideCompletionItems(document : TextDocument, position : Position, token : CancellationToken) : CompletionItem[] | Thenable < CompletionItem[] > | CompletionList | Thenable < CompletionList > {
    
    return new Promise((resolve, reject) => {
        let items:CompletionItem[] = config.getWorkspaceCompletionItems();
        items = [...items, ...config.bintinSybmolInfoList];
        resolve(items);
    });
    
  }

  resolveCompletionItem(item : CompletionItem, token : CancellationToken) : CompletionItem | Thenable < CompletionItem > {
    return item;
  }

}

export default GDScriptCompletionItemProvider;


import * as vscode from "vscode";
import { Middleware, ProvideCompletionItemsSignature } from "vscode-languageclient";

type QuotesPresense = {
    before: boolean;
    after: boolean;
    quoteChar: string | null;
}

export class LSPMiddleware implements Middleware {
    constructor() {}

    async provideCompletionItem(
        document: vscode.TextDocument, 
        position: vscode.Position, 
        context: vscode.CompletionContext, 
        token: vscode.CancellationToken, 
        next: ProvideCompletionItemsSignature
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        // TODO: this is quickfix, should be changed on LSP side later
        const quotesPresense = this.areQuotesPresent(document, position);

        if (quotesPresense.quoteChar !== null) {
            const result = await next(document, position, context, token);
            if (Array.isArray(result)) {
                return result.map((item) => {
                    let textWithModifiedQuotes = item.insertText.toString().replace(/(^")|("$)/g, "");
                    
                    textWithModifiedQuotes = 
                        (quotesPresense.before ? "" : quotesPresense.quoteChar) + 
                        textWithModifiedQuotes +
                        (quotesPresense.after ? "" : quotesPresense.quoteChar);

                    return {
                        ...item,
                        insertText: textWithModifiedQuotes
                    };
                });
            }
        }
        return next(document, position, context, token);
    }

    private areQuotesPresent(document: vscode.TextDocument, position: vscode.Position): QuotesPresense {
        const line = document.lineAt(position.line).text;

        const charBefore = position.character > 0 ? line[position.character - 1] : "";
        const charAfter =
            position.character < line.length ? line[position.character] : "";
        
        if (charBefore === "\"" || charAfter === "\"") {
            return {
                before: charBefore === "\"",
                after: charAfter === "\"",
                quoteChar: "\""
            };
        }
        
        if (charBefore === "\'" || charAfter === "\'") {
            return {
                before: charBefore === "\'",
                after: charAfter === "\'",
                quoteChar: "\'"
            };
        }
        
        return {
            before: false,
            after: false,
            quoteChar: null
        };
    }
}

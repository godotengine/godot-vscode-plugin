import * as vscode from 'vscode'
import * as path from "path";
import * as parser from "../parser"
import * as extension from "../extension"
import * as fs from "fs"

export const id = "showDoc"
export function command() {
    let symbolName = vscode.window.activeTextEditor ? scanDocument(vscode.window.activeTextEditor) : null

    if (symbolName == null || extension.DocContent.docItems.length == 0) {
        showDocItems()
    } else if (vscode.window.activeTextEditor &&
        vscode.window.activeTextEditor.document &&
        (
            vscode.window.activeTextEditor.document.languageId === 'gdscript'
        )) {
        findDoc(symbolName)
    }
}

function showDocItems() {
    vscode.window.showQuickPick(extension.DocContent.docItems).then(selection => {
        if (!selection) {
            return;
        }

        findDoc(selection.label)
    });
}

function scanDocument(textEditor: vscode.TextEditor) {
    const textDocument = textEditor.document

    let pos = textEditor.selection.start
    let line = textDocument.lineAt(pos.line)
    const symbolName = parser.parse(line.text, pos.character)

    if (symbolName) return symbolName
    return null
}

function findDoc(symbolName: string, textEditor?: vscode.TextEditor) {
    textEditor = textEditor || vscode.window.activeTextEditor

    if (!textEditor.document) {
        throw new Error('No open document')
    }

    if (extension.DocContent.dataDirectory) {
        symbolName = symbolName.replace(' ', '')
        let docPath = path.join(extension.DocContent.dataDirectory, `${symbolName}.md`)
        if (fs.existsSync(docPath)) {
            let docUri = vscode.Uri.file(docPath)
            return vscode.commands.executeCommand('markdown.showPreviewToSide', docUri)
        } else if (extension.DocContent.builtIns.has(symbolName)) {
            let docUri = vscode.Uri.file(path.join(extension.DocContent.dataDirectory, `@GDScript.md`))
            return vscode.commands.executeCommand('markdown.showPreviewToSide', docUri)
        } else {
            showDocItems()
        }
    }
}
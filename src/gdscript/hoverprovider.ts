import {
    HoverProvider,
    TextDocument,
    Position,
    CancellationToken,
    Hover,
    MarkedString,
    workspace,
    Uri,
    CompletionItem,
    CompletionItemKind
} from 'vscode';
import {
    isStr,
    getSelectedContent,
    getStrContent
} from './utils';
import config from '../config';
import * as path from 'path';

class GDScriptHoverProvider implements HoverProvider {
    constructor() {}

    provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | Thenable < Hover > {
        let hoverText = getSelectedContent(document, position);
        if (isStr(hoverText))
            hoverText = getStrContent(hoverText);
        const workspaceSymbols = config.getAllSymbols();
        let tips: MarkedString[] = [];
        // check from workspace
        for (let path of Object.keys(workspaceSymbols)) {
            const script = workspaceSymbols[path];
            let scriptips: MarkedString[] = [];
            const getHoverText = (items, type, path): MarkedString[] => {
                const _items: MarkedString[] = [];
                for (let name of Object.keys(items)) {
                    if (name == hoverText) {
                        let dfile = path;
                        if (workspace && workspace.asRelativePath(dfile))
                            dfile = workspace.asRelativePath(dfile);
                        _items.push({language:'gdscript', value:`${type} ${name}`});
                        _items.push(`Defined in *[${dfile}](${Uri.file(path).toString()})*`)
                        break;
                    }
                }
                return _items;
            }
            scriptips = [...scriptips, ...getHoverText(script.variables, 'var', path)];
            scriptips = [...scriptips, ...getHoverText(script.constants, 'const', path)];
            scriptips = [...scriptips, ...getHoverText(script.functions, 'func', path)];
            scriptips = [...scriptips, ...getHoverText(script.signals, 'signal', path)];
            scriptips = [...scriptips, ...getHoverText(script.classes, 'class', path)];
            tips = [...tips, ...scriptips];
        }
        // check from scnes
        for (let scnenepath of Object.keys(config.nodeInfoMap)) {
            const nodes: any[] = config.nodeInfoMap[scnenepath];
            for (let index = 0; index < nodes.length; index++) {
                const node:any = nodes[index];
                const fullpath = node.parent + "/" + node.name;
                if(fullpath == hoverText || fullpath.endsWith(hoverText)) {
                    let filepath = scnenepath;
                    if(workspace && workspace.rootPath)
                        filepath = path.join(workspace.rootPath, filepath);
                    let instance = "";
                    if(node.instance && node.instance.length > 1) {
                        let instancepath = node.instance;
                        if(workspace && workspace.rootPath)
                            instancepath = path.join(workspace.rootPath, instancepath);
                        instance = ` which is an instance of *[${node.instance}](${Uri.file(instancepath).toString()})*`;
                    }
                    tips = [...tips, 
                        {language: 'gdscript', value: `${node.type} ${fullpath}`},
                        `${node.type} defined in *[${scnenepath}](${Uri.file(filepath).toString()})*${instance}`
                    ];
                    break;
                }
            }
        }

        // check from builtin
        const item2MarkdStrings = (name: string,item: CompletionItem):MarkedString[] => {
            let value = "";
            let doc = item.documentation;
            switch (item.kind) {
                case CompletionItemKind.Class:
                    value += name;
                    break;
                case CompletionItemKind.Method:
                    value += item.documentation.substring(0, item.documentation.indexOf("\n"));
                    doc = item.documentation.substring(item.documentation.indexOf("\n")+1, item.documentation.length);
                    break;
                case CompletionItemKind.Interface:
                    value += "signal " + item.documentation.substring(0, item.documentation.indexOf("\n"));
                    doc = item.documentation.substring(item.documentation.indexOf("\n")+1, item.documentation.length);
                    break;
                case CompletionItemKind.Variable:
                case CompletionItemKind.Property:
                    value += "var " + name;
                    break;
                case CompletionItemKind.Enum:
                    value += "const " + name;
                    break;
                default:
                    break;
            }
            return [{language: 'gdscript', value}, doc];
        };
        for (let name of Object.keys(config.builtinSymbolInfoMap)) {
            const pattern = `[A-z@_]+[A-z0-9_]*\\.${hoverText}\\b`;
            if(name == hoverText || name.match(new RegExp(pattern))) {
                const item: CompletionItem = config.builtinSymbolInfoMap[name];
                tips = [...tips, ...(item2MarkdStrings(name, item))];
            }
        }

        if (tips.length > 0)
            return new Hover(tips);
        else
            return null;
    }
}

export default GDScriptHoverProvider;
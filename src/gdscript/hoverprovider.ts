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


function genLink(title:string, uri:string):string {
    const u = encodeURI('command:vscode.previewHtml?' + JSON.stringify(Uri.parse(`godotdoc://${uri}`)));
    return `[${title}](${u})`;
};

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
                        let extra = "";
                        if(type == "func"|| type == "signal" && script.signatures[name])
                            extra = script.signatures[name];
                        _items.push({language:'gdscript', value:`${type} ${name}${extra}`});
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
                        `${genLink(node.type, node.type)} ${fullpath}`,
                        `${node.type} defined in *[${scnenepath}](${Uri.file(filepath).toString()})*${instance}`
                    ];
                    break;
                }
            }
        }

        // check from builtin
        const item2MarkdStrings = (name: string,item: CompletionItem, rowDoc: any):MarkedString[] => {
            let value = "";
            let doc = item.documentation;
            // get class name
            let classname = name;
            let matchs = name.match(/[@A-z][A-z0-9]*\./);
            if(matchs) {
                classname = matchs[0];
                if(classname.endsWith("."))
                    classname = classname.substring(0, classname.length -1);
            }

            const genMethodMarkDown = ():string =>{
                let content = `${genLink(rowDoc.return_type, rowDoc.return_type)} `;
                let matchs = name.match(/[@A-z][A-z0-9]*\./);
                content += `${genLink(classname, classname)}.`;
                let args = "";
                for(let arg of rowDoc.arguments){
                    if(rowDoc.arguments.indexOf(arg)!=0)
                        args += ", ";
                    args += `${genLink(arg.type, arg.type)} ${arg.name}`
                    if(arg.default_value && arg.default_value.length > 0)
                        args += `=${arg.default_value}`;
                }
                content += `${genLink(rowDoc.name, classname+'.'+rowDoc.name)}(${args}) ${rowDoc.qualifiers}`;
                return content;
            };
            
            switch (item.kind) {
                case CompletionItemKind.Class:
                    return [`Native Class ${genLink(classname, classname)}`, doc];
                case CompletionItemKind.Method:
                    doc = item.documentation.substring(item.documentation.indexOf("\n")+1, item.documentation.length);
                    return [genMethodMarkDown(), doc];
                case CompletionItemKind.Interface:
                    doc = item.documentation.substring(item.documentation.indexOf("\n")+1, item.documentation.length);
                    return ['signal ' + genMethodMarkDown(), doc];
                case CompletionItemKind.Variable:
                case CompletionItemKind.Property:
                    return [`${rowDoc.type} ${genLink(classname, classname)}.${genLink(rowDoc.name, classname+"."+rowDoc.name)}`, doc];
                case CompletionItemKind.Enum:
                    return [`const ${genLink(classname, classname)}.${genLink(rowDoc.name, classname+"."+rowDoc.name)} = ${rowDoc.value}`, doc];
                default:
                    break;
            }
            return [name, doc];
        };
        for (let name of Object.keys(config.builtinSymbolInfoMap)) {
            const pattern = `[A-z@_]+[A-z0-9_]*\\.${hoverText}\\b`;
            if(name == hoverText || name.match(new RegExp(pattern))) {
                const item: {completionItem: CompletionItem, rowDoc: any} = config.builtinSymbolInfoMap[name];
                tips = [...tips, ...(item2MarkdStrings(name, item.completionItem, item.rowDoc))];
            }
        }

        if (tips.length > 0)
            return new Hover(tips);
        else
            return null;
    }
}

export default GDScriptHoverProvider;

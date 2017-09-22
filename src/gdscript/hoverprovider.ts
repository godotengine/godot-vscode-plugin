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
        const withMarkdwon = workspace.getConfiguration("GodotTools").get("workspaceDocumentWithMarkdown", false);

        // check from workspace
        const genWorkspaceTips = ()=> {
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
                            let signature = "";
                            if(type == "func"|| type == "signal" && script.signatures[name])
                                signature = script.signatures[name];
                            if(type == "const" && script.constvalues[name])
                                signature = ` = ${script.constvalues[name]}`;
                            _items.push({language:'gdscript', value:`${type} ${name}${signature}`});
                            let doc = script.documents[name];
                            if(!withMarkdwon)
                                doc = "```plaintext\r\n"+doc+"\r\n```";
                            doc = doc?doc+"\r\n\r\n":"";
                            if(path != "autoload")
                                doc += `*Defined in [${dfile}](${Uri.file(path).toString()})*`;
                            _items.push(doc)
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
                if(script.enumerations)
                    scriptips = [...scriptips, ...getHoverText(script.enumerations, 'const', path)];
                tips = [...tips, ...scriptips];
            }
        };
        
        // check from scnes
        const genNodePathTips = ()=> {
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
        };

        const format_documentation = (text) => {
            let doc = text.replace(/\[code\]/g, "`").replace(/\[\/code\]/g, "`");    
            doc = doc.replace(/\[codeblock\]/g, "\n```gdscript\n").replace(/\[\/codeblock]/g, "\n```");
            return doc;
        };

        // check from builtin
        const genBuiltinTips = ()=> {
            const item2MarkdStrings = (name: string,item: CompletionItem, rowDoc: any):MarkedString[] => {
                let value = "";
                let doc = format_documentation(item.documentation);
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
                    if (rowDoc.name != classname) content += `${genLink(classname, classname)}.`;
                    let args = "";
                    for(let arg of rowDoc.arguments){
                        if(rowDoc.arguments.indexOf(arg)!=0)
                            args += ", ";
                        args += `${genLink(arg.type, arg.type)} ${arg.name}`
                        if(arg.default_value && arg.default_value.length > 0)
                            args += `=${arg.default_value}`;
                    }
                    content += `${genLink(rowDoc.name, classname+'.' + rowDoc.name)}(${args}) ${rowDoc.qualifiers}`;
                    return content;
                };
                
                switch (item.kind) {
                    case CompletionItemKind.Class:
                        return [`Native Class ${genLink(classname, classname)}`, doc];
                    case CompletionItemKind.Method:
                        doc = doc.substring(doc.indexOf("\n")+1, doc.length);
                        return [genMethodMarkDown(), doc];
                    case CompletionItemKind.Interface:
                        doc = doc.substring(doc.indexOf("\n")+1, doc.length);
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
        };
        genBuiltinTips();
        genWorkspaceTips();
        genNodePathTips();
        
        if (tips.length > 0)
            return new Hover(tips);
        else
            return null;
    }
}

export default GDScriptHoverProvider;

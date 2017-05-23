import {
    DefinitionProvider,
    TextDocument,
    Position,
    CancellationToken,
    Definition,
    Location,
    workspace,
    Uri,
    Range
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import config from '../config';
import {isStr, getSelectedContent, getStrContent} from './utils';

class GDScriptDefinitionProivder implements DefinitionProvider {
    constructor() {

    }

    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Thenable < Definition > {
        const getDefinitions = (content: string):Location[]| Location => {
            if(content.startsWith("res://")) {
                content = content.replace("res://", "");
                if(workspace && workspace.rootPath)
                    content = path.join(workspace.rootPath, content)
                return new Location(Uri.file(content), new Range(0,0,0,0));
            }
            else if(fs.existsSync(content) && fs.statSync(content).isFile()) {
                return new Location(Uri.file(content), new Range(0,0,0,0));
            }
            else {
                const workspaceSymbols = config.getAllSymbols();
                let locations: Location[] = [];
                // check from workspace
                for (let path of Object.keys(workspaceSymbols)) {
                    const script = workspaceSymbols[path];
                    if(path == "autoload" && script.constpathes && script.constpathes[content])
                        path = script.constpathes[content];
                    let scriptitems: Location[] = [];
                    const checkDifinition = (items)=>{
                        const _items: Location[] = [];
                        for (let name of Object.keys(items)) {
                            if(name == content) {
                                _items.push(new Location(Uri.file(path), items[name]));
                                break;
                            }
                        }
                        return _items;
                    }
                    scriptitems = [...scriptitems, ...checkDifinition(script.variables)];
                    scriptitems = [...scriptitems, ...checkDifinition(script.constants)];
                    scriptitems = [...scriptitems, ...checkDifinition(script.functions)];
                    scriptitems = [...scriptitems, ...checkDifinition(script.signals)];
                    scriptitems = [...scriptitems, ...checkDifinition(script.classes)];
                    if(script.enumerations)
                        scriptitems = [...scriptitems, ...checkDifinition(script.enumerations)];
                    locations = [...locations, ...scriptitems];
                }
                // check from builtin
                if(config.getClass(content) != null) {
                    const uri = encodeURI('command:vscode.previewHtml?' + JSON.stringify(Uri.parse(`godotdoc://${content}`)));
                    locations.push(new Location(Uri.parse(uri), new Range(0,0,0,0)));
                }
                return locations;
            }
        };
        
        return new Promise((resolve, reject) => {
            let selStr = getSelectedContent(document, position);
            if(selStr) {
                // For strings
                if(isStr(selStr)) {
                    selStr =  getStrContent(selStr);
                    let fpath = path.join(path.dirname(document.uri.fsPath), selStr)
                    if(fs.existsSync(fpath) && fs.statSync(fpath).isFile())
                        selStr = fpath
                }
                resolve(getDefinitions(selStr));
            }
            else
                reject(new Error("Empty selection"));
        });
    }
}

export default GDScriptDefinitionProivder;

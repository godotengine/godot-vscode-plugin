import {TextDocumentContentProvider, DocumentLinkProvider, Uri, CancellationToken } from 'vscode';
import config from '../config';

const linkStyle = `
<style>
    a { color: #6e8ae7; text-decoration: none;}
</style>
`;

function genLink(title:string, uri:string, span=true):string {
    const u = encodeURI('command:vscode.previewHtml?' + JSON.stringify(Uri.parse(`godotdoc://${uri}`)));
    let link = `<a href="${u}">${title}</a>`;
    if(span)
        link = `<span>${link}</span>`;
    return link;
};

function getProp(rawDoc:any, propname: string, action=(s :string)=>s): string {
    let prop = rawDoc[propname];
    if(prop && prop.length > 0)
        prop =  action(prop);
    return prop;
}

class GDScriptDocumentContentProvider implements TextDocumentContentProvider{
    constructor() {
    }

    /**
     * Provide textual content for a given uri.
     *
     * The editor will use the returned string-content to create a readonly
     * [document](TextDocument). Resources allocated should be released when
     * the corresponding document has been [closed](#workspace.onDidCloseTextDocument).
     *
     * @param uri An uri which scheme matches the scheme this provider was [registered](#workspace.registerTextDocumentContentProvider) for.
     * @param token A cancellation token.
     * @return A string or a thenable that resolves to such.
     */
    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        const request = uri.authority;
        let classname = request;
        let membername = null;
        const self = this;
        return new Promise((resolve, reject) => {
            if(request.indexOf(".") != -1) {
                classname = request.substring(0, request.indexOf("."));
                if(!request.endsWith("."))
                    membername = request.substring(request.indexOf(".")+1, request.length);
            }
            if(classname.length >= 1) {
                for(let key of config.getBuiltinClassNameList()) {
                    if(key.toLowerCase() == classname) {
                        classname = key;
                        break;
                    }
                }
            }

            if(classname && classname.length > 0) {
                if(membername && membername.length >0 )
                    resolve(self.genMemberDoc(classname, membername)) ;
                else
                    resolve(self.genClassDoc(config.getClass(classname)));
            }
            reject(new Error("Open Documentation Failed!"));
        });
    }

    genMethodDoc(mDoc:any):string {
        let ret_type = getProp(mDoc, "return_type", (type:string):string =>{
            if(type.length > 0)
                return `${genLink(type,type)} `;
            else
                return "<b>void</b>";
        });
        let args = "";
        for(let arg of mDoc.arguments){
            if(mDoc.arguments.indexOf(arg)!=0)
                args += ", ";
            args += `${genLink(arg.type, arg.type)} ${arg.name}`
            if(arg.default_value && arg.default_value.length > 0)
                args += `=${arg.default_value}`;
        }
        let doc = `
            <li>
                <h4 id="${mDoc.name}">${ret_type} ${mDoc.name} (${args}) <i>${mDoc.qualifiers}</i></h4>
                <p>${mDoc.description}</p>
            </li>
        `;
        return doc;
    }

    genMethodHeader(mDoc:any, classname:string):string {
        let ret_type = getProp(mDoc, "return_type", (type:string):string =>{
            if(type.length > 0)
                return `${genLink(type,type)} `;
            else
                return "<b>void</b>";
        });
        let args = "";
        for(let arg of mDoc.arguments){
            if(mDoc.arguments.indexOf(arg)!=0)
                args += ", ";
            args += `${genLink(arg.type, arg.type)} ${arg.name}`
            if(arg.default_value && arg.default_value.length > 0)
                args += `=${arg.default_value}`;
        }
        let doc = `
            <li>
                ${ret_type} ${genLink(mDoc.name, classname+"."+mDoc.name)} (${args}) <i>${mDoc.qualifiers}</i>
            </li>
        `;  
        return doc;
    }


    genPropDoc(pDoc:any): string {
        let doc = `
            <li>
                <h4>${genLink(pDoc.type,pDoc.type)} ${pDoc.name}</h4>
                <p>${pDoc.description}</p>
            </li>
        `;
        return doc;
    }

    genConstDoc(cDoc:any): string {
        let doc = `
            <li>
                <h4>${cDoc.name} = ${cDoc.value}</h4>
                <p>${cDoc.description}</p>
            </li>
        `;
        return doc;
    }

    genMemberDoc(classname, membername): string {
        let realDoc = null;
        const classdoc = config.getClass(classname);
        if(!classdoc)
            return null;
        for(let m of classdoc.methods) {
            if(m.name.toLowerCase() == membername) {
                realDoc = this.genMethodDoc(m);
                break;
            }
        }
        if(!realDoc) {
            for(let s of classdoc.signals) {
                if(s.name.toLowerCase() == membername) {
                    realDoc = this.genMethodDoc(s);
                    break;
                }
            }
        }

        if(!realDoc) {
            for(let c of classdoc.constants) {
                if(c.name.toLowerCase() == membername) {
                    realDoc = this.genConstDoc(c);
                    break;
                }
            }
        }

        if(!realDoc) {
            for(let p of classdoc.properties) {
                if(p.name.toLowerCase() == membername) {
                    realDoc = this.genPropDoc(p);
                    break;
                }
            }
        }

        if(!realDoc) {
            for(let p of classdoc.theme_properties) {
                if(p.name.toLowerCase() == membername) {
                    realDoc = this.genPropDoc(p);
                    break;
                }
            }
        }
        
        if(!realDoc)
            return null;
        
        let doc = `
            ${linkStyle}
            <h2>Documentation of ${genLink(classname, classname)}.${membername}</h2>
            <ul>${realDoc}</ul>
        `;
        return doc;
    }

    genClassDoc(rawDoc): string {
        if(!rawDoc)
            return null;
        const classname = rawDoc.name;
        let inherits = getProp(rawDoc, "inherits", (inherits:string)=>{
            return "<h4>Inherits: " + genLink(inherits, inherits, true) +"</h4>";
        });

        let category = getProp(rawDoc, "category", (c:string)=>{
            return "<h4>Category: " + c +"</h4>";
        });

        let subclasses = "";
        for(let key of config.getBuiltinClassNameList()) {
            let c = config.getClass(key);
            if(c && c.inherits == classname) {
                subclasses += genLink(key, key, true) + " "
            }
        };
        if(subclasses && subclasses.length > 0)
            subclasses = "<h3>Inherited by</h3> " + "<ul><li>" + subclasses + "</li></ul>";
        
        let briefDescript = getProp(rawDoc, "brief_description", (dec:string)=>{
            return "<h3>Brief Description</h3>" + "<ul><li>" + dec + "</li></ul>";
        });
        let descript = getProp(rawDoc, "description", (dec:string)=>{
            return "<h3>Description</h3>" + "<ul><li>" + dec + "</li></ul>";
        });

        let methods = "";
        for(let m of rawDoc.methods) {
            methods += this.genMethodDoc(m);
        }
        if(methods.length >0 )
            methods = `<h3>Methods</h3><ul>${methods}</ul/>`;

        let methodHeaders = ""
        for(let m of rawDoc.methods) {
            methodHeaders += this.genMethodHeader(m, classname);
        }
        if(methodHeaders.length >0)
            methodHeaders = `<h3>Method List</h3><ul>${methodHeaders}</ul/>`;
        
        let signals = "";
        for(let s of rawDoc.signals) {
            signals += this.genMethodDoc(s);
        }
        if(signals.length >0 )
            signals = `<h3>Signals</h3><ul>${signals}</ul/>`;

        let props = "";
        for(let p of rawDoc.properties) {
            props += this.genPropDoc(p)
        }
        for(let p of rawDoc.theme_properties) {
            props += this.genPropDoc(p)
        }
        if(props.length >0 )
            props = `<h3>Properties</h3><ul>${props}</ul>`

        let constants = "";
        for(let c of rawDoc.constants) {
            constants += this.genConstDoc(c);
        }
        if(constants.length >0 )
            constants = `<h3>Constants</h3><ul>${constants}</ul>`
        
        let doc = `
            ${linkStyle}
            <h1>Native Class ${classname}</h1>
            <p>${category}</p>
            <p>${inherits}</p>
            <p>${subclasses}</p>
            <p>${briefDescript}</p>
            <p>${descript}</p>
            <p>${methodHeaders}</p>
            <p>${signals}</p>
            <p>${constants}</p>
            <p>${props}</p>
            <p>${methods}</p>
        `;
        return doc;
    }
}

export default GDScriptDocumentContentProvider;

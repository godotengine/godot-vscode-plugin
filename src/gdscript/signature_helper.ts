import {
  SignatureHelpProvider,
  TextDocument,
  Position,
  CancellationToken,
  SignatureInformation,
  SignatureHelp,
  CompletionItemKind,
  ParameterInformation,
  workspace
} from 'vscode';
import config from '../config';
import { countSubStr } from './utils';
class GDScriptSignatureHelpProvider implements SignatureHelpProvider {
  constructor() {}

  provideSignatureHelp(document : TextDocument, position : Position, token : CancellationToken) : SignatureHelp | Thenable < SignatureHelp > {
    const self = this;
    return new Promise((resolve, reject) => {
      const res = self.do_provideSignatureHelp(document, position);
      resolve(res);
    });
  }
  /**
   * Provide help for the signature at the given position and document.
   *
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   * @return Signature help or a thenable that resolves to such. The lack of a result can be
   * signaled by returning `undefined` or `null`.
   */
  do_provideSignatureHelp(document : TextDocument, position : Position) : SignatureHelp | Thenable < SignatureHelp > {
    const range = document.getWordRangeAtPosition(position);
    let funcname = "";
    let curparam = 0;
    const checkPosition = () => {
      const line = document.lineAt(position);
      const startPos = line.firstNonWhitespaceCharacterIndex;
      const endPos = position.character;
      const queryStr = line.text.substring(startPos, endPos);
      
      var reg = /([A-z_]+[A-z0-9_]*)\(/g;
      let match = reg.exec(queryStr);
      while (match != null) {
        funcname = match[1];
        match = reg.exec(queryStr);
      }
      if(funcname != "") {
        const funcrangestr = line.text.substring(line.text.indexOf(queryStr)+queryStr.indexOf(funcname)+funcname.length, endPos);
        curparam = countSubStr(funcrangestr, ",");
      }

    };

    checkPosition();

    let resultSignatures: SignatureInformation[] = [];

    if (funcname.length > 0) {
      // Builtin functions
      for (let key of Object.keys(config.builtinSymbolInfoMap)) {
        if (key.endsWith(`\.${funcname}`)) {
          if (config.builtinSymbolInfoMap[key].completionItem.kind == CompletionItemKind.Method || config.builtinSymbolInfoMap[key].completionItem.kind == CompletionItemKind.Function) {
            const rawDoc = config.builtinSymbolInfoMap[key].rowDoc;
            const item = config.builtinSymbolInfoMap[key].completionItem;
            let signatureInfor: SignatureInformation = new SignatureInformation(item.documentation.split('\n')[0], rawDoc.description);
            for(let arg of rawDoc.arguments){
              let param: ParameterInformation = new ParameterInformation(`${arg.type} ${arg.name}${arg.default_value.length>0?'='+arg.default_value:''}`, "");
              signatureInfor.parameters.push(param);
            }
            resultSignatures.push(signatureInfor);
          }
        }
      }
      // workspace functions
      for (let path of Object.keys(config.getAllSymbols())) {
          let script = config.getSymbols(path);
          if(!script.signatures)
            continue
          let relaPath = path;
          if(workspace && workspace.rootPath)
            relaPath = workspace.asRelativePath(relaPath);
          
          for(let f of Object.keys(script.signatures)) {
            if(f == funcname) {
              const signatureStr = script.signatures[f];
              let signature: SignatureInformation = new SignatureInformation(`func ${f}${signatureStr}`, `Method defined in ${relaPath}`);
              const params = (signatureStr.substring(signatureStr.indexOf("(")+1, signatureStr.indexOf(")"))).split(",");
              for(let p of params)
                signature.parameters.push(new ParameterInformation(p, ""));
              resultSignatures.push(signature);
            }
          }
      }
    }
    if(resultSignatures.length > 0) {
      return ({
        signatures: resultSignatures,
        activeSignature: 0,
        activeParameter: curparam
      });
    }
    return null
}

}

export default GDScriptSignatureHelpProvider;
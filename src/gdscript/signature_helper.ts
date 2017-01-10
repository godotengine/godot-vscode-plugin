import {
  SignatureHelpProvider,
  TextDocument,
  Position,
  CancellationToken,
  SignatureInformation,
  SignatureHelp,
  CompletionItemKind,
  ParameterInformation
} from 'vscode';
import config from '../config';
import { countSubStr } from './utils';
class GDScriptSignatureHelpProvider implements SignatureHelpProvider {
  constructor() {}

  /**
   * Provide help for the signature at the given position and document.
   *
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   * @return Signature help or a thenable that resolves to such. The lack of a result can be
   * signaled by returning `undefined` or `null`.
   */
  provideSignatureHelp(document : TextDocument, position : Position, token : CancellationToken) : SignatureHelp | Thenable < SignatureHelp > {
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

    let help: SignatureHelp = {
      signatures: [],
      activeSignature: 0,
      activeParameter: curparam
    };

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
            help.signatures.push(signatureInfor);
          }
        }
      }
      // workspace functions
    //   for (let path of Object.keys(config.getAllSymbols())) {
    //       const script = config.getSymbols(path);
    //       for(let f of Object.keys(script.signatures)) {
    //         if(f == funcname) {
    //           let signatureInfor: SignatureInformation = new SignatureInformation(`func ${f}${script.signatures[f]}`, `Method defined in ${path}`);
    //           let param: ParameterInformation = new ParameterInformation(script.signatures[f], "");
    //           signatureInfor.parameters.push(param);
    //           help.signatures.push(signatureInfor);
    //         }
    //       }
    //   }
    
    }
    if(help.signatures.length>0)
      return help;

    return null
}

}

export default GDScriptSignatureHelpProvider;
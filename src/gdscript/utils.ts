import {TextDocument, Position} from 'vscode';

export function isStr(content:string) {
    return (content.startsWith("'") || content.startsWith('"') || content.startsWith('@"') ) && (content.endsWith("'") || content.endsWith('"'));
}

export function getSelectedContent(document: TextDocument, position: Position):string {
    const line = document.lineAt(position);
    const wordRange = document.getWordRangeAtPosition(position) ;
    const machs = line.text.match(/[A-z_]+[A-z_0-9]*|".*?"|'.*?'|@".*?"/g)
    let res = line.text.substring(wordRange.start.character, wordRange.end.character);
    machs.map(m=>{
        if(m) {
            const startPos = line.text.indexOf(m);
            const endPos = startPos + m.length;
            if(isStr(m) && startPos != -1 && wordRange.start.character >= startPos && wordRange.end.character <= endPos){
                res = m;
                return;
            }
        }
    });
    return res;
};

export function getStrContent(rawstr: string):string {
    let ss = rawstr;
    if(isStr(ss)) {
        ss = ss.replace(/"|'|@"|"""/g,"")
    }
    return ss;
}

export function countSubStr(str:string, sub:string): number {
    let count = 0;
    let pos = str.indexOf(sub);
    while (pos !== -1) {
        count++;
        pos = str.indexOf(sub, pos + sub.length);
    }
    return count;
}
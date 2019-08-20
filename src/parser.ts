export function parseToSymbol(text : string, pos : number) {
    let moduleName = null;

    let re = / \b[a-zA-Z]\w*/g;
    let str = text;
    let matched;
    while ((matched = re.exec(str)) != null) {
        if (matched.index <= pos && pos <= re.lastIndex) {
            moduleName = matched[0];
            break;
        }
    }

    return moduleName;
}
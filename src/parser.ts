export function parse(text : string, pos : number) {
    let moduleName;

    let re = / \b\w*/g;
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
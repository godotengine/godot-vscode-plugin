import * as http from 'http';
import * as vscode from 'vscode';

function requestGodot(body : Object) {
    let postString = JSON.stringify(body);
    const port = vscode.workspace.getConfiguration("GodotTools").get("editorServerPort", 6996);
    const options = {
        hostname: '127.0.0.1',
        method: 'POST',
        port,
        body,
        headers: {
            "Accept": "application/json",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postString)
        }
    };
    let promise = new Promise((resolve, reject) => {
        var req = http.request(options, (res) => {
            let resultString = "";
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                resultString += chunk;
            });
            res.on('end', () => {
                resolve(JSON.parse(resultString));
            });
        });
        req.on('error', (e) => {
            reject(e);
        });
        req.write(postString);
        req.end();

    });
    return promise;
}

export default requestGodot;
import * as http from 'http';

function requestGodot(body : Object) {
    let postString = JSON.stringify(body);
    const options = {
        hostname: '127.0.0.1',
        port: 6996,
        method: 'POST',
        headers: {
            "Accept": "application/json",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postString)
        },
        body
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
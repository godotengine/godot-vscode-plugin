import * as path from "node:path";
import Mocha from "mocha";

export function run(): Promise<void> {
	const mocha = new Mocha({ ui: "tdd", color: true, timeout: 120_000 });
	mocha.addFile(path.resolve(__dirname, "debugger_v2.integration.js"));
	return new Promise((resolve, reject) => mocha.run((failures) => failures ? reject(new Error(`${failures} debugger v2 integration test(s) failed.`)) : resolve()));
}

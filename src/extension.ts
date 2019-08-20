import { ExtensionContext } from "vscode";
import { GodotTools } from "./godot-tools";
import * as path from "path";
import * as fs from "fs"
import * as vscode from 'vscode'

let tools: GodotTools = null;

export class DocContent {
	static docItems: vscode.QuickPickItem[] = []
	static builtIns = new Set()
	static dataDirectory

	constructor(dataPath : string) {
		DocContent.dataDirectory = path.join(dataPath, 'godot', 'doc')
		let indexLocation = path.join(dataPath, 'godot', 'doc', `index.json`)

		fs.readFile(indexLocation, 'utf8', function (err, data) {
			if (err) {
				throw err
			}

			var index = JSON.parse(data);
			for (let i = 0; i < index.size; i++) {
				DocContent.docItems.push({
					label: index.contents[i].label,
					description: index.contents[i].detail
				})
			}
			for (let i = 0; i < index.builtinSize; i++) {
				DocContent.builtIns.add(index.builtin[i])
			}
		});

	}
}

export function activate(context: ExtensionContext) {
	tools = new GodotTools(context);
	tools.activate();
}

export function deactivate(): Thenable<void> {
	return new Promise((resolve, reject) => {
		tools.deactivate();
		resolve();
	});
}

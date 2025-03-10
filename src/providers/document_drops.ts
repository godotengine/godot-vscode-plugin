import * as path from "node:path";
import * as vscode from "vscode";
import {
	CancellationToken,
	DataTransfer,
	DocumentDropEdit,
	DocumentDropEditProvider,
	ExtensionContext,
	languages,
	Position,
	ProviderResult,
	Range,
	TextDocument,
	Uri,
} from "vscode";
import { SceneParser } from "../scene_tools/parser";
import { createLogger, node_name_to_snake, get_project_version, convert_uri_to_resource_path } from "../utils";
import { SceneNode } from "../scene_tools/types";

const log = createLogger("providers.drops");

export class GDDocumentDropEditProvider implements DocumentDropEditProvider {
	public parser = new SceneParser();

	constructor(private context: ExtensionContext) {
		const dropEditSelector = [
			{ language: "csharp", scheme: "file" },
			{ language: "gdscript", scheme: "file" },
		];
		context.subscriptions.push(languages.registerDocumentDropEditProvider(dropEditSelector, this));
	}

	public async provideDocumentDropEdits(
		document: TextDocument,
		position: Position,
		dataTransfer: DataTransfer,
		token: CancellationToken,
	): Promise<DocumentDropEdit> {
		// log.debug("provideDocumentDropEdits", document, dataTransfer);

		const targetResPath = await convert_uri_to_resource_path(document.uri);

		const originFsPath = dataTransfer.get("godot/scene").value;
		const originUri = vscode.Uri.file(originFsPath);

		const originDocument = await vscode.workspace.openTextDocument(originUri);
		const scene = await this.parser.parse_scene(originDocument);

		let scriptId = "";
		for (const res of scene.externalResources.values()) {
			if (res.path === targetResPath) {
				scriptId = res.id;
				break;
			}
		}

		let nodePathOfTarget: SceneNode;
		if (scriptId) {
			const find_node = () => {
				if (scene.root.scriptId === scriptId) {
					return scene.root;
				}
				for (const node of scene.nodes.values()) {
					if (node.scriptId === scriptId) {
						return node;
					}
				}
			};
			nodePathOfTarget = find_node();
		}

		const className: string = dataTransfer.get("godot/class")?.value;
		if (className) {
			const nodePath: string = dataTransfer.get("godot/path")?.value;
			let relativePath: string = dataTransfer.get("godot/relativePath")?.value;
			const unique = dataTransfer.get("godot/unique")?.value === "true";
			const label: string = dataTransfer.get("godot/label")?.value;

			if (nodePathOfTarget) {
				const targetPath = path.normalize(path.relative(nodePathOfTarget?.path, nodePath));
				relativePath = targetPath.split(path.sep).join(path.posix.sep);
			}

			// For the root node, the path is empty and needs to be replaced with the node name
			let savePath = relativePath || label;

			if (document.languageId === "gdscript") {
				if (savePath.startsWith(".")) {
					savePath = `'${savePath}'`;
				}
				let qualifiedPath = `$${savePath}`;

				if (unique) {
					// For unique nodes, we can use the % syntax and drop the full path
					qualifiedPath = `%${label}`;
				}

				const line = document.lineAt(position.line);
				if (line.text === "") {
					// We assume that if the user is dropping a node in an empty line, they are at the top of
					// the script and want to declare an onready variable

					const snippet = new vscode.SnippetString();

					if ((await get_project_version())?.startsWith("4")) {
						snippet.appendText("@");
					}
					snippet.appendText("onready var ");
					snippet.appendPlaceholder(node_name_to_snake(label));
					snippet.appendText(`: ${className} = ${qualifiedPath}`);
					return new vscode.DocumentDropEdit(snippet);
				}

				// In any other place, we assume the user wants to get a reference to the node itself
				return new vscode.DocumentDropEdit(qualifiedPath);
			}

			if (document.languageId === "csharp") {
				return new vscode.DocumentDropEdit(`GetNode<${className}>("${savePath}")`);
			}
		}
	}
}

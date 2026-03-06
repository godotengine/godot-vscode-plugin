import * as fs from "node:fs";
import { basename, extname } from "node:path";
import { TextDocument, Uri } from "vscode";
import { SceneNode, Scene, SceneResource } from "./types";
import { createLogger } from "../utils";

const log = createLogger("scenes.parser");

export class SceneParser {
	private static instance: SceneParser;
	public scenes: Map<string, Scene> = new Map();

	constructor() {
		if (SceneParser.instance) {
			// biome-ignore lint/correctness/noConstructorReturn: <explanation>
			return SceneParser.instance;
		}
		SceneParser.instance = this;
	}

	public parse_scene(document: TextDocument): Scene {
		const filePath = document.uri.fsPath;
		const stats = fs.statSync(filePath); // can throw

		if (this.scenes.has(filePath)) {
			const existingScene = this.scenes.get(filePath);

			if (existingScene && existingScene.mtime === stats.mtimeMs) {
				return existingScene;
			}
		}

		const scene = new Scene();
		scene.path = filePath;
		scene.mtime = stats.mtimeMs;
		scene.title = basename(filePath);

		this.scenes.set(filePath, scene);

		const text = document.getText();

		for (const match of text.matchAll(/\[ext_resource.*/g)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const resPath = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/ id="?([\w]+)"?/)?.[1];

			if (id && match.index !== undefined) {
				scene.externalResources.set(id, {
					body: line,
					path: resPath || "",
					type: type || "",
					uid: uid || "",
					id: id,
					index: match.index,
					line: document.lineAt(document.positionAt(match.index)).lineNumber + 1,
				});
			}
		}

		let lastResource: SceneResource | undefined = undefined;
		for (const match of text.matchAll(/\[sub_resource.*/g)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const resPath = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/ id="?([\w]+)"?/)?.[1];
			const resource: SceneResource = {
				path: resPath || "",
				type: type || "",
				uid: uid || "",
				id: id || "",
				index: match.index,
				line: document.lineAt(document.positionAt(match.index)).lineNumber + 1,
				body: "",
			};
			if (lastResource) {
				lastResource.body = text.slice(lastResource.index, match.index).trimEnd();
			}

			if (id) {
				scene.subResources.set(id, resource);
			}
			lastResource = resource;
		}

		let root = "";
		const nodes: Record<string, SceneNode> = {};
		let lastNode: SceneNode | undefined = undefined;

		const nodeRegex = /\[node.*/g;
		for (const match of text.matchAll(nodeRegex)) {
			const line = match[0];
			const name = line.match(/name="([^.:@/"%]+)"/)?.[1] || "unknown";
			const type = line.match(/type="([\w]+)"/)?.[1] ?? "PackedScene";
			let parent = line.match(/parent="(([^.:@/"%]|[\/.])+)"/)?.[1];
			const instance = line.match(/instance=ExtResource\(\s*"?([\w]+)"?\s*\)/)?.[1];

			// leaving this in case we have a reason to use these node paths in the future
			// const rawNodePaths = line.match(/node_paths=PackedStringArray\(([\w",\s]*)\)/)?.[1];
			// const nodePaths = rawNodePaths?.split(",").forEach(x => x.trim().replace("\"", ""));

			let _path = "";
			let relativePath = "";

			if (parent === undefined) {
				root = name;
				_path = name;
				parent = "";
			} else if (parent === ".") {
				parent = root;
				relativePath = name;
				_path = `${parent}/${name}`;
			} else {
				relativePath = `${parent}/${name}`;
				parent = `${root}/${parent}`;
				_path = `${parent}/${name}`;
			}
			if (lastNode) {
				lastNode.body = text.slice(lastNode.position, match.index);
				lastNode.parse_body();
			}
			if (lastResource) {
				lastResource.body = text.slice(lastResource.index, match.index).trimEnd();
				lastResource = undefined;
			}

			const node = new SceneNode(name, type);
			node.path = _path;
			node.description = type;
			node.relativePath = relativePath;
			node.parent = parent;
			node.text = match[0];
			node.position = match.index;
			node.resourceUri = Uri.from({
				scheme: "godot",
				path: _path,
			});
			scene.nodes.set(_path, node);

			if (instance) {
				const res = scene.externalResources.get(instance);
				if (res) {
					node.tooltip = res.path;
					node.resourcePath = res.path;
					if ([".tscn"].includes(extname(node.resourcePath))) {
						node.contextValue += "openable";
					}
				}
				node.contextValue += "hasResourcePath";
			}
			if (_path === root) {
				scene.root = node;
			}
			if (parent in nodes) {
				nodes[parent].children.push(node);
			}
			nodes[_path] = node;

			lastNode = node;
		}

		if (lastNode) {
			lastNode.body = text.slice(lastNode.position, text.length);
			lastNode.parse_body();
		}

		const resourceRegex = /\[resource\]/g;
		for (const match of text.matchAll(resourceRegex)) {
			if (lastResource) {
				lastResource.body = text.slice(lastResource.index, match.index).trimEnd();
				lastResource = undefined;
			}
		}
		return scene;
	}
}

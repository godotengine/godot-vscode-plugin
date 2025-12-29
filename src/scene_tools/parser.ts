import * as fs from "node:fs";
import * as path from "node:path";
import { basename, extname } from "node:path";
import * as vscode from "vscode";
import { TextDocument, Uri } from "vscode";
import { SceneNode, Scene } from "./types";
import { createLogger, convert_resource_path_to_uri } from "../utils";

const log = createLogger("scenes.parser", { output: "Godot Scene Parser" });

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

	/**
	 * Parse a scene file without recursively loading instanced scenes.
	 * Use parse_scene_recursive() for full tree including instanced PackedScenes.
	 */
	public parse_scene(document: TextDocument) {
		const scenePath = document.uri.fsPath;
		const stats = fs.statSync(scenePath);

		if (this.scenes.has(scenePath)) {
			const scene = this.scenes.get(scenePath);

			if (scene.mtime === stats.mtimeMs) {
				log.info(`Cache HIT for ${basename(scenePath)}: root has ${scene.root?.children?.length ?? 0} children, ${scene.nodes.size} total nodes`);
				return scene;
			}
			log.info(`Cache STALE for ${basename(scenePath)}: cached mtime ${scene.mtime} vs file mtime ${stats.mtimeMs}`);
		} else {
			log.info(`Cache MISS for ${basename(scenePath)}`);
		}

		const scene = new Scene();
		scene.path = scenePath;
		scene.mtime = stats.mtimeMs;
		scene.title = basename(scenePath);

		this.scenes.set(scenePath, scene);

		const text = document.getText();

		for (const match of text.matchAll(/\[ext_resource.*/g)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const path = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/ id="?([\w]+)"?/)?.[1];

			scene.externalResources.set(id, {
				body: line,
				path: path,
				type: type,
				uid: uid,
				id: id,
				index: match.index,
				line: document.lineAt(document.positionAt(match.index)).lineNumber + 1,
			});
		}

		let lastResource = null;
		for (const match of text.matchAll(/\[sub_resource.*/g)) {
			const line = match[0];
			const type = line.match(/type="([\w]+)"/)?.[1];
			const path = line.match(/path="([\w.:/]+)"/)?.[1];
			const uid = line.match(/uid="([\w:/]+)"/)?.[1];
			const id = line.match(/ id="?([\w]+)"?/)?.[1];
			const resource = {
				path: path,
				type: type,
				uid: uid,
				id: id,
				index: match.index,
				line: document.lineAt(document.positionAt(match.index)).lineNumber + 1,
			};
			if (lastResource) {
				lastResource.body = text.slice(lastResource.index, match.index).trimEnd();
			}

			scene.subResources.set(id, resource);
			lastResource = resource;
		}

		let root = "";
		const nodes: { [key: string]: SceneNode } = {};
		let lastNode = null;

		const nodeRegex = /\[node.*/g;
		let nodeMatchCount = 0;
		for (const match of text.matchAll(nodeRegex)) {
			nodeMatchCount++;
			const line = match[0];
			const name = line.match(/name="([^.:@/"%]+)"/)?.[1];
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
				lastResource = null;
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
				log.info(`[DEBUG] Set root node: "${name}"`);
			}
			if (parent in nodes) {
				nodes[parent].children.push(node);
				log.info(`[DEBUG] Added "${name}" as child of "${parent}" (now has ${nodes[parent].children.length} children)`);
			} else if (parent) {
				log.warn(`[DEBUG] Parent NOT FOUND for "${name}": looking for "${parent}" in nodes keys: ${Object.keys(nodes).join(', ')}`);
			}
			nodes[_path] = node;

			lastNode = node;
		}

		if (lastNode) {
			lastNode.body = text.slice(lastNode.position, text.length);
			lastNode.parse_body();
		}

		// Debug logging to identify parsing issues
		log.info(`Parse complete for ${scene.title}: ${nodeMatchCount} nodes matched, ${scene.nodes.size} in map`);
		if (scene.root) {
			log.info(`Root node: "${scene.root.label}" with ${scene.root.children.length} direct children`);
			for (const child of scene.root.children) {
				log.info(`  Child: "${child.label}" (${child.className}) with ${child.children.length} grandchildren`);
			}
		}

		const resourceRegex = /\[resource\]/g;
		for (const match of text.matchAll(resourceRegex)) {
			if (lastResource) {
				lastResource.body = text.slice(lastResource.index, match.index).trimEnd();
				lastResource = null;
			}
		}
		return scene;
	}

	/**
	 * Parse a scene file and recursively load all instanced PackedScenes.
	 * This provides a complete tree including nodes from instanced scenes.
	 *
	 * @param document The scene document to parse
	 * @param maxDepth Maximum recursion depth to prevent infinite loops (default 10)
	 * @param visited Set of already visited scene paths to prevent circular references
	 */
	public async parse_scene_recursive(
		document: TextDocument,
		maxDepth = 10,
		visited: Set<string> = new Set()
	): Promise<Scene> {
		const scenePath = document.uri.fsPath;

		// Prevent circular references
		if (visited.has(scenePath)) {
			log.debug(`Circular reference detected, skipping: ${scenePath}`);
			return this.parse_scene(document);
		}
		visited.add(scenePath);

		// First, parse the scene without recursion
		const scene = this.parse_scene(document);

		// If we've hit max depth, stop recursing
		if (maxDepth <= 0) {
			log.debug(`Max recursion depth reached for: ${scenePath}`);
			return scene;
		}

		// Find all nodes that are instances of other scenes
		const instancedNodes: SceneNode[] = [];

		// Check root node
		if (scene.root?.resourcePath) {
			instancedNodes.push(scene.root);
		}

		// Check all other nodes
		for (const node of scene.nodes.values()) {
			if (node.resourcePath && node !== scene.root) {
				instancedNodes.push(node);
			}
		}

		// Recursively parse each instanced scene
		for (const instanceNode of instancedNodes) {
			try {
				const resPath = instanceNode.resourcePath;

				// Only process .tscn files
				if (!resPath.endsWith(".tscn")) {
					continue;
				}

				// Convert res:// path to file URI
				const instanceUri = await convert_resource_path_to_uri(resPath);
				if (!instanceUri) {
					log.debug(`Could not resolve resource path: ${resPath}`);
					continue;
				}

				// Check if file exists
				if (!fs.existsSync(instanceUri.fsPath)) {
					log.debug(`Instanced scene file not found: ${instanceUri.fsPath}`);
					continue;
				}

				// Open and parse the instanced scene
				const instanceDocument = await vscode.workspace.openTextDocument(instanceUri);
				const instanceScene = await this.parse_scene_recursive(
					instanceDocument,
					maxDepth - 1,
					visited
				);

				// Merge the instanced scene's nodes as children of the instance node
				if (instanceScene.root) {
					this.mergeInstancedNodes(instanceNode, instanceScene, scene);
				}
			} catch (error) {
				log.error(`Error parsing instanced scene ${instanceNode.resourcePath}:`, error);
			}
		}

		return scene;
	}

	/**
	 * Merge nodes from an instanced scene into the parent scene.
	 * The instanced scene's root node children become children of the instance node.
	 */
	private mergeInstancedNodes(
		instanceNode: SceneNode,
		instanceScene: Scene,
		parentScene: Scene
	): void {
		// Clone and reparent all children of the instanced scene's root
		const rootChildren = instanceScene.root?.children || [];

		for (const child of rootChildren) {
			// Clone the node to avoid modifying the cached instance scene
			const clonedChild = this.cloneNodeTree(child, instanceNode, parentScene);
			instanceNode.children.push(clonedChild);
		}
	}

	/**
	 * Deep clone a node and its children, updating paths relative to new parent.
	 */
	private cloneNodeTree(
		node: SceneNode,
		newParent: SceneNode,
		targetScene: Scene
	): SceneNode {
		// Create a new node with the same properties
		const clonedNode = new SceneNode(node.label as string, node.className, node.collapsibleState);

		// Update path to be relative to the new parent
		clonedNode.path = `${newParent.path}/${node.label}`;
		clonedNode.parent = newParent.path;
		clonedNode.relativePath = node.relativePath
			? `${this.getRelativePathFromRoot(newParent)}/${node.relativePath}`
			: `${this.getRelativePathFromRoot(newParent)}/${node.label}`;

		// Copy other properties
		clonedNode.text = node.text;
		clonedNode.position = node.position;
		clonedNode.body = node.body;
		clonedNode.unique = node.unique;
		clonedNode.hasScript = node.hasScript;
		clonedNode.scriptId = node.scriptId;
		clonedNode.resourcePath = node.resourcePath;
		clonedNode.description = node.description;
		clonedNode.tooltip = node.tooltip;
		clonedNode.contextValue = node.contextValue;

		// Mark as coming from an instanced scene for UI purposes
		clonedNode.contextValue = `${clonedNode.contextValue || ""}fromInstance`;

		// Add to parent scene's nodes map
		targetScene.nodes.set(clonedNode.path, clonedNode);

		// Recursively clone children
		for (const child of node.children) {
			const clonedChild = this.cloneNodeTree(child, clonedNode, targetScene);
			clonedNode.children.push(clonedChild);
		}

		return clonedNode;
	}

	/**
	 * Get the relative path from the scene root to a node.
	 */
	private getRelativePathFromRoot(node: SceneNode): string {
		return node.relativePath || node.label as string;
	}
}

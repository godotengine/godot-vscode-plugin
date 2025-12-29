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
	// Cache for root node types from instanced scenes
	private rootTypeCache: Map<string, string> = new Map();

	constructor() {
		if (SceneParser.instance) {
			// biome-ignore lint/correctness/noConstructorReturn: <explanation>
			return SceneParser.instance;
		}
		SceneParser.instance = this;
	}

	/**
	 * Get the root node type from a scene file without fully parsing it.
	 * Uses a lightweight regex scan and caches results.
	 * @param resourcePath The res:// path to the scene file
	 * @returns The root node type, or "PackedScene" if not found
	 */
	public async getRootTypeFromScene(resourcePath: string): Promise<string> {
		// Check cache first
		if (this.rootTypeCache.has(resourcePath)) {
			return this.rootTypeCache.get(resourcePath);
		}

		try {
			const uri = await convert_resource_path_to_uri(resourcePath);
			if (!uri || !fs.existsSync(uri.fsPath)) {
				return "PackedScene";
			}

			// Read just the first part of the file to find the root node
			const content = fs.readFileSync(uri.fsPath, "utf-8");

			// Find the first [node ...] line (root node has no parent attribute)
			const rootNodeMatch = content.match(/\[node\s+name="[^"]+"\s+type="(\w+)"\]/);
			if (rootNodeMatch?.[1]) {
				const rootType = rootNodeMatch[1];
				this.rootTypeCache.set(resourcePath, rootType);
				return rootType;
			}

			// If no type found, it might be a scene that inherits from another scene
			// In that case, we'd need to parse recursively, so just return PackedScene
			this.rootTypeCache.set(resourcePath, "PackedScene");
			return "PackedScene";
		} catch (error) {
			log.warn(`Failed to get root type from ${resourcePath}:`, error);
			return "PackedScene";
		}
	}

	/**
	 * Synchronous version for cases where we can't use async.
	 * @param resourcePath The res:// path to the scene file
	 * @returns The root node type, or "PackedScene" if not found
	 */
	public getRootTypeFromSceneSync(resourcePath: string): string {
		// Check cache first
		if (this.rootTypeCache.has(resourcePath)) {
			return this.rootTypeCache.get(resourcePath);
		}

		try {
			// We need to resolve the resource path synchronously
			// This is a simplified version that works with the workspace folder
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return "PackedScene";
			}

			// Convert res:// to filesystem path
			const resPath = resourcePath.replace(/^res:\/\//, "");
			const fullPath = path.join(workspaceFolders[0].uri.fsPath, resPath);

			if (!fs.existsSync(fullPath)) {
				return "PackedScene";
			}

			const content = fs.readFileSync(fullPath, "utf-8");

			// Find the first [node ...] line with a type (root node has no parent attribute)
			const rootNodeMatch = content.match(/\[node\s+name="[^"]+"\s+type="(\w+)"\]/);
			if (rootNodeMatch?.[1]) {
				const rootType = rootNodeMatch[1];
				this.rootTypeCache.set(resourcePath, rootType);
				return rootType;
			}

			this.rootTypeCache.set(resourcePath, "PackedScene");
			return "PackedScene";
		} catch (error) {
			log.warn(`Failed to get root type from ${resourcePath}:`, error);
			return "PackedScene";
		}
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
				log.debug(`Cache HIT for ${basename(scenePath)}`);
				return scene;
			}
			log.debug(`Cache STALE for ${basename(scenePath)}`);
		} else {
			log.debug(`Cache MISS for ${basename(scenePath)}`);
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
						// Get the actual root type from the instanced scene
						const actualType = this.getRootTypeFromSceneSync(res.path);
						if (actualType !== "PackedScene") {
							node.className = actualType;
							node.description = actualType;
						}
					}
				}
				node.contextValue += "hasResourcePath";
				// Mark as instanced for UI badge
				node.contextValue += "instanced";
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

import * as fs from "node:fs";
import { basename, extname } from "node:path";
import { TextDocument, Uri } from "vscode";
import { createLogger } from "../utils";
import { formatValueForScene, normalizeValue } from "./property_inspector/utils";
import { Scene, SceneNode } from "./types";

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

	public parse_scene(document: TextDocument) {
		const path = document.uri.fsPath;
		const stats = fs.statSync(path);

		if (this.scenes.has(path)) {
			const scene = this.scenes.get(path);

			if (scene.mtime === stats.mtimeMs) {
				return scene;
			}
		}

		const scene = new Scene();
		scene.path = path;
		scene.mtime = stats.mtimeMs;
		scene.title = basename(path);

		this.scenes.set(path, scene);

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
		const nodes = {};
		let lastNode = null;

		const nodeRegex = /\[node.*/g;
		for (const match of text.matchAll(nodeRegex)) {
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
	 * Update a property value in the scene file
	 */
	public async updatePropertyInSceneFile(
		scene: Scene,
		node: SceneNode,
		propertyName: string,
		newValue: string,
		propertyType: string,
		defaultValue: string
	): Promise<void> {
		log.info(`Updating property ${propertyName} = ${newValue} for node ${node.label}`);

		// Normalize values for comparison
		const normalizedNewValue = normalizeValue(newValue);
		const normalizedDefaultValue = normalizeValue(defaultValue);

		// If new value matches default, remove the property from scene file
		if (normalizedNewValue === normalizedDefaultValue || (newValue === '' && defaultValue === '')) {
			log.info(`Property ${propertyName} matches default value, removing from scene file`);
			await this.removePropertyFromSceneFile(scene, node, propertyName);
			return;
		}

		const scenePath = scene.path;
		
		// Read the current scene file
		const sceneContent = await fs.promises.readFile(scenePath, 'utf-8');
		const lines = sceneContent.split('\n');
		
		// Find node boundaries
		const { nodeStartIndex, nodeEndIndex } = this.findNodeBoundaries(lines, node);
		
		if (nodeStartIndex === -1) {
			throw new Error(`Could not find node ${node.label} in scene file`);
		}
		
		// Look for existing property within the node section
		let propertyLineIndex = -1;
		const propertyPattern = new RegExp(`^${propertyName}\\s*=`);
		
		for (let i = nodeStartIndex + 1; i < nodeEndIndex; i++) {
			if (propertyPattern.test(lines[i].trim())) {
				propertyLineIndex = i;
				log.info(`Found existing property at line ${i}: ${lines[i]}`);
				break;
			}
		}
		
		// Format the new value based on type
		const formattedValue = formatValueForScene(newValue, propertyType);
		const newPropertyLine = `${propertyName} = ${formattedValue}`;
		log.info(`New property line: ${newPropertyLine}`);
		
		if (propertyLineIndex >= 0) {
			// Update existing property
			log.info(`Updating existing property at line ${propertyLineIndex}`);
			lines[propertyLineIndex] = newPropertyLine;
		} else {
			// Add new property after the node header
			log.info(`Adding new property after node header at line ${nodeStartIndex + 1}`);
			lines.splice(nodeStartIndex + 1, 0, newPropertyLine);
		}
		
		// Write the updated content back to the file
		const newSceneContent = lines.join('\n');
		await fs.promises.writeFile(scenePath, newSceneContent, 'utf-8');
		log.info(`Scene file updated successfully`);
		
		// Update the node's body in memory
		await this.updateNodeBodyInMemory(lines, node, nodeStartIndex);
	}

	/**
	 * Remove a property from the scene file (reset to default)
	 */
	public async removePropertyFromSceneFile(
		scene: Scene,
		node: SceneNode,
		propertyName: string
	): Promise<void> {
		log.info(`Removing property ${propertyName} from node ${node.label}`);

		const scenePath = scene.path;
		
		// Read the current scene file
		const sceneContent = await fs.promises.readFile(scenePath, 'utf-8');
		const lines = sceneContent.split('\n');
		
		// Find node boundaries
		const { nodeStartIndex, nodeEndIndex } = this.findNodeBoundaries(lines, node);
		
		if (nodeStartIndex === -1) {
			throw new Error(`Could not find node ${node.label} in scene file`);
		}
		
		// Look for existing property within the node section and remove it
		const propertyPattern = new RegExp(`^${propertyName}\\s*=`);
		
		for (let i = nodeStartIndex + 1; i < nodeEndIndex; i++) {
			if (propertyPattern.test(lines[i].trim())) {
				log.info(`Found property to remove at line ${i}: ${lines[i]}`);
				lines.splice(i, 1);
				break;
			}
		}
		
		// Write the updated content back to the file
		const newSceneContent = lines.join('\n');
		await fs.promises.writeFile(scenePath, newSceneContent, 'utf-8');
		log.info(`Scene file updated successfully`);
		
		// Update the node's body in memory
		await this.updateNodeBodyInMemory(lines, node, nodeStartIndex);
	}

	/**
	 * Find the start and end line indices for a node in the scene file
	 */
	private findNodeBoundaries(lines: string[], node: SceneNode): { nodeStartIndex: number; nodeEndIndex: number } {
		// Escape special regex characters in node label
		const escapedNodeLabel = node.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const nodeHeaderPattern = new RegExp(`^\\[node name="${escapedNodeLabel}"`);
		let nodeStartIndex = -1;
		let nodeEndIndex = -1;
		
		log.info(`Looking for node pattern: ${nodeHeaderPattern.source}`);
		
		// Find node start
		for (let i = 0; i < lines.length; i++) {
			if (nodeHeaderPattern.test(lines[i])) {
				nodeStartIndex = i;
				log.info(`Found node at line ${i}: ${lines[i]}`);
				break;
			}
		}
		
		if (nodeStartIndex === -1) {
			log.error(`Could not find node ${node.label} in scene file`);
			log.info(`Scene file contains ${lines.length} lines`);
			log.info(`First few lines: ${lines.slice(0, 10).join('\\n')}`);
			return { nodeStartIndex: -1, nodeEndIndex: -1 };
		}
		
		// Find node end (next node or end of file)
		nodeEndIndex = lines.length;
		for (let i = nodeStartIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			// Check if this is the start of another node, sub_resource, or ext_resource
			if (line.startsWith('[node ') || line.startsWith('[sub_resource') || line.startsWith('[ext_resource')) {
				nodeEndIndex = i;
				log.info(`Node section ends at line ${i}: ${line}`);
				break;
			}
		}
		
		log.info(`Node section: lines ${nodeStartIndex} to ${nodeEndIndex - 1}`);
		
		return { nodeStartIndex, nodeEndIndex };
	}

	/**
	 * Update the node's body in memory after modifying the scene file
	 */
	private async updateNodeBodyInMemory(lines: string[], node: SceneNode, nodeStartIndex: number): Promise<void> {
		// Recalculate nodeEndIndex after modifying the lines array
		let newNodeEndIndex = lines.length;
		for (let i = nodeStartIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			// Check if this is the start of another node, sub_resource, or ext_resource
			if (line.startsWith('[node ') || line.startsWith('[sub_resource') || line.startsWith('[ext_resource')) {
				newNodeEndIndex = i;
				break;
			}
		}
		
		const newNodeBody = lines.slice(nodeStartIndex + 1, newNodeEndIndex).join('\n');
		log.info(`Updating node body. Old body length: ${node.body?.length || 0}, New body length: ${newNodeBody.length}`);
		log.info(`New node body: ${newNodeBody}`);
		node.body = newNodeBody;
		
		// Re-parse the node to update its property values
		node.parse_body();
		log.info(`Node parsing complete`);
	}
}

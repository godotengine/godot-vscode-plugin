import * as fs from "node:fs";
import { createLogger } from "../../utils";
import type { Scene, SceneNode } from "../types";
import { formatValueForScene, normalizeValue } from "./utils";

const log = createLogger("scenes.property_inspector.file_operations");

export class SceneFileOperations {
	/**
	 * Update a property value in the scene file
	 */
	public static async updatePropertyInSceneFile(
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
	public static async removePropertyFromSceneFile(
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
	 * Parse property values from a node's body
	 */
	public static parseNodePropertyValues(node: SceneNode): Map<string, string> {
		const propertyValues = new Map<string, string>();
		
		if (!node.body) {
			return propertyValues;
		}

		// Parse each line of the node body to extract property assignments
		const lines = node.body.split('\n');
		for (const line of lines) {
			const trimmedLine = line.trim();
			
			// Look for property assignments (propertyName = value)
			const assignmentMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
			if (assignmentMatch) {
				const propertyName = assignmentMatch[1];
				let propertyValue = assignmentMatch[2].trim();
				
				// Remove quotes from string values
				if (propertyValue.startsWith('"') && propertyValue.endsWith('"')) {
					propertyValue = propertyValue.slice(1, -1);
				}
				
				propertyValues.set(propertyName, propertyValue);
			}
		}
		
		return propertyValues;
	}

	/**
	 * Find the start and end line indices for a node in the scene file
	 */
	private static findNodeBoundaries(lines: string[], node: SceneNode): { nodeStartIndex: number; nodeEndIndex: number } {
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
	private static async updateNodeBodyInMemory(lines: string[], node: SceneNode, nodeStartIndex: number): Promise<void> {
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
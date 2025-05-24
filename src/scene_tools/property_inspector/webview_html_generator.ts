import { globals } from "../../extension";
import type { PropertyData, PropertyEditorInfo } from "./types";
import {
    escapeHtml,
    extractPropertyValue,
    formatPropertyName,
    getPropertyEditorInfo,
    normalizeValue
} from "./utils";
import { getWebviewScripts } from "./webview_scripts";
import { getWebviewStyles } from "./webview_styles";

export class WebviewHtmlGenerator {
	public static generateEmptyHtml(): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Node Properties</title>
				<style>${getWebviewStyles()}</style>
			</head>
			<body>
				<div class="empty-state">
					<p>Select a node in the Scene Preview to view its properties</p>
				</div>
			</body>
			</html>
		`;
	}

	public static generatePropertiesHtml(
		nodeName: string,
		propertiesByClass: Map<string, PropertyData[]>
	): string {
		let sectionsHtml = '';

		// Generate sections for each class
		for (const [className, properties] of propertiesByClass) {
			sectionsHtml += this.generateSectionHtml(className, properties, propertiesByClass);
		}

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Node Properties</title>
				<style>${getWebviewStyles()}</style>
			</head>
			<body>
				<div class="properties-container">
					<div class="header">
						<h3>${escapeHtml(nodeName)}</h3>
					</div>
					${sectionsHtml}
				</div>
				<script>${getWebviewScripts()}</script>
			</body>
			</html>
		`;
	}

	private static generateSectionHtml(
		className: string, 
		properties: PropertyData[],
		propertiesByClass: Map<string, PropertyData[]>
	): string {
		const sectionId = `section-${className.replace(/[^a-zA-Z0-9]/g, '-')}`;
		let propertiesHtml = '';

		for (const { property, source, currentValue } of properties) {
			const formattedName = formatPropertyName(property.name);
			const propertyType = property.detail?.split(':')[1]?.split('=')[0]?.trim() || 'unknown';
			const propertyValue = currentValue || extractPropertyValue(property);
			const defaultValue = extractPropertyValue(property);
			const displayValue = propertyValue || '';
			const editorInfo = getPropertyEditorInfo(property);

			// Check if current value differs from default (show reset button)
			const hasNonDefaultValue = this.hasNonDefaultValue(propertyValue, defaultValue);

			// Create source indicator only for script properties
			let sourceIndicator = '';
			if (source === 'script') {
				sourceIndicator = '<span class="source-indicator script">S</span>';
			}

			// Enhanced tooltip with better documentation
			let tooltipText = property.documentation || 'No documentation available';
			if (source === 'inherited') {
				tooltipText = `[Inherited] ${tooltipText}`;
			}
			if (propertyType !== 'unknown') {
				tooltipText = `${propertyType} - ${tooltipText}`;
			}

			// Generate editor HTML based on type and layout
			const editorHtml = this.generateEditorHtml(
				property.name, 
				displayValue, 
				propertyType, 
				editorInfo, 
				defaultValue
			);

			// Reset button (only show if value is different from default)
			const resetButton = hasNonDefaultValue ? `
				<button class="reset-button" 
						onclick="resetProperty('${escapeHtml(property.name)}')" 
						title="Reset to default value (${escapeHtml(defaultValue)})">
					🔄
				</button>
			` : '';

			if (editorInfo.layout === 'vertical') {
				// Vertical layout: property name on top, editor below (full width)
				propertiesHtml += `
					<div class="property-row vertical-layout" title="${escapeHtml(tooltipText)}">
						<div class="property-header">
							<div class="property-key">
								${sourceIndicator}
								<span class="property-name">${escapeHtml(formattedName)}</span>
								${resetButton}
							</div>
							<div class="type-info">${escapeHtml(propertyType)}</div>
						</div>
						<div class="property-editor-container">
							${editorHtml}
						</div>
					</div>
				`;
			} else {
				// Horizontal layout: property name on left, editor on right
				propertiesHtml += `
					<div class="property-row horizontal-layout" title="${escapeHtml(tooltipText)}">
						<div class="property-key">
							${sourceIndicator}
							<span class="property-name">${escapeHtml(formattedName)}</span>
							${resetButton}
						</div>
						<div class="property-value">
							${editorHtml}
							<span class="type-info">${escapeHtml(propertyType)}</span>
						</div>
					</div>
				`;
			}
		}

		// Check if documentation is available for this class
		const hasDocumentation = globals.docsProvider?.classInfo?.has(className) || false;

		return `
			<div class="section">
				<div class="section-header" onclick="toggleSection('${sectionId}')">
					<div class="section-header-content">
						<span class="section-toggle">▼</span>
						<span class="section-title">${escapeHtml(className)}</span>
						<span class="section-count">${properties.length}</span>
					</div>
					${hasDocumentation ? `
						<button class="docs-link" 
								onclick="event.stopPropagation(); openDocumentation('${escapeHtml(className)}')" 
								title="Open ${escapeHtml(className)} documentation">
							📖
						</button>
					` : ''}
				</div>
				<div class="section-content" id="${sectionId}">
					${propertiesHtml}
				</div>
			</div>
		`;
	}

	private static generateEditorHtml(
		propertyName: string, 
		value: string, 
		propertyType: string, 
		editorInfo: PropertyEditorInfo,
		defaultValue: string
	): string {
		const escapedValue = escapeHtml(value);
		const dataAttributes = `data-property="${escapeHtml(propertyName)}" data-type="${escapeHtml(propertyType)}"`;
		const defaultDataAttribute = `data-default="${escapeHtml(defaultValue)}"`;

		switch (editorInfo.type) {
			case 'string':
				return `<div class="control-container"><input type="text" class="property-editor string-editor" value="${escapedValue}" ${dataAttributes} ${defaultDataAttribute} onchange="updateProperty(this)" /></div>`;
			
			case 'number':
				return `<div class="control-container"><input type="number" class="property-editor number-editor" value="${escapedValue}" ${dataAttributes} ${defaultDataAttribute} onchange="updateProperty(this)" step="any" /></div>`;
			
			case 'boolean':
				const isChecked = value.toLowerCase() === 'true' ? 'checked' : '';
				const displayText = value.toLowerCase() === 'true' ? 'On' : 'Off';
				return `<div class="control-container boolean-container">
					<input type="checkbox" class="property-editor boolean-editor" ${isChecked} ${dataAttributes} ${defaultDataAttribute} onchange="updateProperty(this)" />
					<span class="boolean-text">${displayText}</span>
				</div>`;
			
			case 'multiline_string':
				return `<textarea class="property-editor multiline-editor" rows="3" ${dataAttributes} ${defaultDataAttribute} onchange="updateProperty(this)">${escapedValue}</textarea>`;
			
			case 'readonly':
			default:
				return `<div class="control-container"><span class="value-display readonly">${escapedValue}</span></div>`;
		}
	}

	private static hasNonDefaultValue(propertyValue: string, defaultValue: string): boolean {
		if (!propertyValue || propertyValue === '') {
			return false; // No current value, so it's at default
		}
		
		if (!defaultValue || defaultValue === '') {
			return true; // Has a value when default is empty
		}
		
		const normalizedCurrent = normalizeValue(propertyValue);
		const normalizedDefault = normalizeValue(defaultValue);
		
		return normalizedCurrent !== normalizedDefault;
	}
} 
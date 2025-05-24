import type { GodotNativeSymbol } from "../../providers/documentation_types";
import type { PropertyEditorInfo } from "./types";

// Helper function to format property names: "some_random_key" -> "Some Random Key"
export function formatPropertyName(name: string): string {
	return name
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

// Helper function to extract a readable value from property detail
export function extractPropertyValue(property: GodotNativeSymbol): string {
	if (!property.detail) return "";
	
	// Look for default values in common patterns like "property_name: Type = value"
	const defaultMatch = property.detail.match(/=\s*(.+)$/);
	if (defaultMatch) {
		let value = defaultMatch[1].trim();
		
		// Remove surrounding quotes and unescape if present
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
			// Unescape common escape sequences
			value = value
				.replace(/\\n/g, '\n')
				.replace(/\\t/g, '\t')
				.replace(/\\r/g, '\r')
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, '\\');
		}
		
		return value;
	}
	
	// For now, just return empty for non-string properties
	return "";
}

// Helper function to determine editor type and layout for a property
export function getPropertyEditorInfo(property: GodotNativeSymbol): PropertyEditorInfo {
	const detail = property.detail || '';
	const name = property.name;
	
	// Extract type from detail (e.g., "property_name: String = value" -> "String")
	const typeMatch = detail.match(/:\s*([^=]+?)(?:\s*=|$)/);
	const propertyType = typeMatch ? typeMatch[1].trim() : 'unknown';
	
	// Determine if this should be a multiline string editor
	if (propertyType.toLowerCase().includes('string') && 
		(name.toLowerCase().includes('text') || 
		 name.toLowerCase().includes('description') || 
		 name.toLowerCase().includes('content'))) {
		return { type: 'multiline_string', layout: 'vertical' };
	}
	
	// Basic type determination
	if (propertyType.toLowerCase().includes('string')) {
		return { type: 'string', layout: 'horizontal' };
	} else if (propertyType.toLowerCase().includes('int') || 
			   propertyType.toLowerCase().includes('float') ||
			   propertyType.toLowerCase().includes('number')) {
		return { type: 'number', layout: 'horizontal' };
	} else if (propertyType.toLowerCase().includes('bool')) {
		return { type: 'boolean', layout: 'horizontal' };
	}
	
	// Default to readonly for unknown types
	return { type: 'readonly', layout: 'horizontal' };
}

// Helper function to escape HTML
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Normalize values for comparison
export function normalizeValue(val: string): string {
	if (!val) return '';
	
	// Remove quotes from string values for comparison
	if (val.startsWith('"') && val.endsWith('"')) {
		let unquoted = val.slice(1, -1);
		// Unescape common escape sequences for proper comparison
		unquoted = unquoted
			.replace(/\\n/g, '\n')
			.replace(/\\t/g, '\t')
			.replace(/\\r/g, '\r')
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, '\\');
		return unquoted;
	}
	
	// Normalize boolean values
	if (val.toLowerCase() === 'true' || val.toLowerCase() === 'false') {
		return val.toLowerCase();
	}
	
	// Normalize numeric values
	if (!isNaN(Number(val))) {
		return String(Number(val));
	}
	
	return val;
}

// Format value based on property type
export function formatValueForScene(value: string, propertyType: string): string {
	if (propertyType.toLowerCase().includes('string')) {
		// Handle multiline strings
		if (value.includes('\n')) {
			return `"${value.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`;
		} else {
			return `"${value.replace(/"/g, '\\"')}"`;
		}
	} else if (propertyType.toLowerCase().includes('bool')) {
		return value.toLowerCase() === 'true' ? 'true' : 'false';
	} else if (propertyType.toLowerCase().includes('vector2')) {
		// Handle Vector2 format: Vector2(x, y)
		if (!value.startsWith('Vector2(')) {
			return `Vector2(${value})`;
		}
	} else if (propertyType.toLowerCase().includes('vector3')) {
		// Handle Vector3 format: Vector3(x, y, z)
		if (!value.startsWith('Vector3(')) {
			return `Vector3(${value})`;
		}
	}
	return value;
} 
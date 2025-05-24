import { PropertyEditorInfo, PropertyInfo } from './types';

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatPropertyName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractPropertyValue(property: PropertyInfo): string {
  if (!property.detail) return '';
  
  const parts = property.detail.split('=');
  if (parts.length < 2) return '';
  
  let value = parts.slice(1).join('=').trim();
  
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

export function normalizeValue(val: string | undefined | null): string {
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

export function getPropertyEditorInfo(property: PropertyInfo): PropertyEditorInfo {
  const propertyType = property.detail?.split(':')[1]?.split('=')[0]?.trim() || 'unknown';
  const propertyName = property.name.toLowerCase();
  
  // Determine editor type based on property type
  if (propertyType === 'bool') {
    return { type: 'boolean', layout: 'horizontal' };
  } else if (propertyType === 'int' || propertyType === 'float') {
    return { type: 'number', layout: 'horizontal' };
  } else if (propertyType === 'String') {
    // Multi-line for certain property names
    if (propertyName === 'text' || propertyName === 'bbcode_text' || propertyName.includes('_text')) {
      return { type: 'multiline_string', layout: 'vertical' };
    }
    return { type: 'string', layout: 'horizontal' };
  } else if (propertyType.includes('Vector') || propertyType.includes('Rect') || 
             propertyType.includes('Transform') || propertyType.includes('Color')) {
    // Complex types are read-only for now
    return { type: 'readonly', layout: 'horizontal' };
  }
  
  // Default to read-only
  return { type: 'readonly', layout: 'horizontal' };
}

export function getPropertyType(property: PropertyInfo): string {
  return property.detail?.split(':')[1]?.split('=')[0]?.trim() || 'unknown';
}

export function hasNonDefaultValue(currentValue: string | undefined, defaultValue: string): boolean {
  if (!currentValue || currentValue === '') {
    return false; // No current value, so it's at default
  }
  
  if (!defaultValue || defaultValue === '') {
    return true; // Has a value when default is empty
  }
  
  const normalizedCurrent = normalizeValue(currentValue);
  const normalizedDefault = normalizeValue(defaultValue);
  
  return normalizedCurrent !== normalizedDefault;
} 
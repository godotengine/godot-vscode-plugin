import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { PropertyData, vscode } from '../types';
import {
    extractPropertyValue,
    formatPropertyName,
    getPropertyEditorInfo,
    getPropertyType,
    hasNonDefaultValue
} from '../utils';
import {
    BooleanEditor,
    MultilineStringEditor,
    NumberEditor,
    ReadonlyEditor,
    StringEditor
} from './PropertyEditors';

interface PropertyRowProps {
  propertyData: PropertyData;
}

export const PropertyRow: FunctionComponent<PropertyRowProps> = ({ propertyData }) => {
  const { property, source, currentValue } = propertyData;
  const formattedName = formatPropertyName(property.name);
  const propertyType = getPropertyType(property);
  const propertyValue = currentValue || extractPropertyValue(property);
  const defaultValue = extractPropertyValue(property);
  const displayValue = propertyValue || '';
  const editorInfo = getPropertyEditorInfo(property);

  const [showReset, setShowReset] = useState(hasNonDefaultValue(propertyValue, defaultValue));

  // Enhanced tooltip with better documentation
  let tooltipText = property.documentation || 'No documentation available';
  if (source === 'inherited') {
    tooltipText = `[Inherited] ${tooltipText}`;
  }
  if (propertyType !== 'unknown') {
    tooltipText = `${propertyType} - ${tooltipText}`;
  }

  const handlePropertyChange = (propertyName: string, newValue: string, propertyType: string) => {
    console.log('Property change:', propertyName, newValue, propertyType);
    vscode.postMessage({
      type: 'propertyChange',
      propertyName,
      newValue,
      propertyType
    });
  };

  const handleReset = () => {
    console.log('Reset property:', property.name);
    vscode.postMessage({
      type: 'propertyReset',
      propertyName: property.name
    });
  };

  const handleResetVisibilityChange = (hasNonDefaultValue: boolean) => {
    setShowReset(hasNonDefaultValue);
  };

  const renderEditor = () => {
    const commonProps = {
      propertyName: property.name,
      value: displayValue,
      propertyType,
      defaultValue,
      onChange: handlePropertyChange,
      onResetVisibilityChange: handleResetVisibilityChange
    };

    switch (editorInfo.type) {
      case 'string':
        return <StringEditor {...commonProps} />;
      case 'number':
        return <NumberEditor {...commonProps} />;
      case 'boolean':
        return <BooleanEditor {...commonProps} />;
      case 'multiline_string':
        return <MultilineStringEditor {...commonProps} />;
      case 'readonly':
      default:
        return <ReadonlyEditor value={displayValue} />;
    }
  };

  if (editorInfo.layout === 'vertical') {
    // Vertical layout: property name on top, editor below (full width)
    return (
      <div class="property-row vertical-layout" title={tooltipText}>
        <div class="property-header">
          <div class="property-key">
            {source === 'script' && <span class="source-indicator script">S</span>}
            <span class="property-name">{formattedName}</span>
            {showReset && (
              <button 
                class="reset-button" 
                onClick={handleReset}
                title={`Reset to default value (${defaultValue})`}
              >
                🔄
              </button>
            )}
          </div>
          <div class="type-info">{propertyType}</div>
        </div>
        <div class="property-editor-container">
          {renderEditor()}
        </div>
      </div>
    );
  } else {
    // Horizontal layout: property name on left, editor on right
    return (
      <div class="property-row horizontal-layout" title={tooltipText}>
        <div class="property-key">
          {source === 'script' && <span class="source-indicator script">S</span>}
          <span class="property-name">{formattedName}</span>
          {showReset && (
            <button 
              class="reset-button" 
              onClick={handleReset}
              title={`Reset to default value (${defaultValue})`}
            >
              🔄
            </button>
          )}
        </div>
        <div class="property-value">
          {renderEditor()}
          <span class="type-info">{propertyType}</span>
        </div>
      </div>
    );
  }
}; 
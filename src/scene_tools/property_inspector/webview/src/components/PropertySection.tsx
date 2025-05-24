import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { PropertyData, vscode } from '../types';
import { PropertyRow } from './PropertyRow';

interface PropertySectionProps {
  className: string;
  properties: PropertyData[];
  hasDocumentation: boolean;
}

export const PropertySection: FunctionComponent<PropertySectionProps> = ({ 
  className, 
  properties,
  hasDocumentation 
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sectionId = `section-${className.replace(/[^a-zA-Z0-9]/g, '-')}`;

  const toggleSection = () => {
    setIsCollapsed(!isCollapsed);
  };

  const openDocumentation = (e: Event) => {
    e.stopPropagation();
    console.log('Opening documentation for:', className);
    vscode.postMessage({
      type: 'openDocumentation',
      className
    });
  };

  return (
    <div class={`section ${isCollapsed ? 'collapsed' : ''}`}>
      <div class="section-header" onClick={toggleSection}>
        <div class="section-header-content">
          <span class="section-toggle">{isCollapsed ? '▶' : '▼'}</span>
          <span class="section-title">{className}</span>
          <span class="section-count">{properties.length}</span>
        </div>
        {hasDocumentation && (
          <button 
            class="docs-link" 
            onClick={openDocumentation}
            title={`Open ${className} documentation`}
          >
            📖
          </button>
        )}
      </div>
      <div class="section-content" id={sectionId} style={{ display: isCollapsed ? 'none' : 'block' }}>
        {properties.map(propertyData => (
          <PropertyRow key={propertyData.property.name} propertyData={propertyData} />
        ))}
      </div>
    </div>
  );
}; 
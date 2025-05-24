import { FunctionComponent } from 'preact';
import { PropertiesByClass } from '../types';
import { PropertySection } from './PropertySection';

interface AppProps {
  nodeName: string;
  propertiesByClass: PropertiesByClass;
  hasDocumentation: (className: string) => boolean;
}

export const App: FunctionComponent<AppProps> = ({ nodeName, propertiesByClass, hasDocumentation }) => {
  const isEmpty = Object.keys(propertiesByClass).length === 0;

  if (isEmpty) {
    return (
      <div class="empty-state">
        <p>Select a node in the Scene Preview to view its properties</p>
      </div>
    );
  }

  return (
    <div class="properties-container">
      <div class="header">
        <h3>{nodeName}</h3>
      </div>
      {Object.entries(propertiesByClass).map(([className, properties]) => (
        <PropertySection
          key={className}
          className={className}
          properties={properties}
          hasDocumentation={hasDocumentation(className)}
        />
      ))}
    </div>
  );
}; 
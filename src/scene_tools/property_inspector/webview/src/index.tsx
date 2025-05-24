import { render } from 'preact';
import { App } from './components/App';
import './styles/main.css';
import { PropertiesByClass } from './types';

// Initial state
let currentState = {
  nodeName: '',
  propertiesByClass: {} as PropertiesByClass,
  documentedClasses: new Set<string>()
};

// Function to check if a class has documentation
const hasDocumentation = (className: string): boolean => {
  return currentState.documentedClasses.has(className);
};

// Render function
const renderApp = () => {
  const container = document.getElementById('app');
  if (container) {
    render(
      <App 
        nodeName={currentState.nodeName}
        propertiesByClass={currentState.propertiesByClass}
        hasDocumentation={hasDocumentation}
      />,
      container
    );
  }
};

// Handle messages from the extension
window.addEventListener('message', event => {
  const message = event.data;
  
  switch (message.type) {
    case 'updateProperties':
      currentState = {
        nodeName: message.nodeName || '',
        propertiesByClass: message.propertiesByClass || {},
        documentedClasses: new Set(message.documentedClasses || [])
      };
      renderApp();
      break;
      
    case 'clearProperties':
      currentState = {
        nodeName: '',
        propertiesByClass: {},
        documentedClasses: new Set()
      };
      renderApp();
      break;
  }
});

// Initial render
renderApp();

// Log that we're ready
console.log('Preact Property Inspector initialized'); 
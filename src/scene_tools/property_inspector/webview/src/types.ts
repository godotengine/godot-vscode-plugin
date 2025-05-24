// VSCode WebView API
declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

export const vscode = acquireVsCodeApi();

export interface PropertyInfo {
  name: string;
  detail?: string;
  documentation?: string;
}

export interface PropertyData {
  property: PropertyInfo;
  source: 'script' | 'inherited';
  currentValue?: string;
}

export interface PropertyEditorInfo {
  type: 'string' | 'number' | 'boolean' | 'multiline_string' | 'readonly';
  layout: 'horizontal' | 'vertical';
}

export interface MessageToExtension {
  type: 'propertyChange' | 'propertyReset' | 'openDocumentation';
  propertyName?: string;
  newValue?: string;
  propertyType?: string;
  className?: string;
}

export interface PropertiesByClass {
  [className: string]: PropertyData[];
} 
import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { normalizeValue } from '../utils';

interface BaseEditorProps {
  propertyName: string;
  value: string;
  propertyType: string;
  defaultValue: string;
  onChange: (propertyName: string, newValue: string, propertyType: string) => void;
  onResetVisibilityChange?: (hasNonDefaultValue: boolean) => void;
}

export const StringEditor: FunctionComponent<BaseEditorProps> = ({
  propertyName,
  value,
  propertyType,
  defaultValue,
  onChange,
  onResetVisibilityChange
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.value;
    setLocalValue(newValue);
    onChange(propertyName, newValue, propertyType);
    
    if (onResetVisibilityChange) {
      const hasNonDefault = normalizeValue(newValue) !== normalizeValue(defaultValue);
      onResetVisibilityChange(hasNonDefault);
    }
  };

  return (
    <div class="control-container">
      <input
        type="text"
        class="property-editor string-editor"
        value={localValue}
        onChange={handleChange}
        data-property={propertyName}
        data-type={propertyType}
        data-default={defaultValue}
      />
    </div>
  );
};

export const NumberEditor: FunctionComponent<BaseEditorProps> = ({
  propertyName,
  value,
  propertyType,
  defaultValue,
  onChange,
  onResetVisibilityChange
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.value;
    setLocalValue(newValue);
    onChange(propertyName, newValue, propertyType);
    
    if (onResetVisibilityChange) {
      const hasNonDefault = normalizeValue(newValue) !== normalizeValue(defaultValue);
      onResetVisibilityChange(hasNonDefault);
    }
  };

  return (
    <div class="control-container">
      <input
        type="number"
        class="property-editor number-editor"
        value={localValue}
        onChange={handleChange}
        step="any"
        data-property={propertyName}
        data-type={propertyType}
        data-default={defaultValue}
      />
    </div>
  );
};

export const BooleanEditor: FunctionComponent<BaseEditorProps> = ({
  propertyName,
  value,
  propertyType,
  defaultValue,
  onChange,
  onResetVisibilityChange
}) => {
  const isChecked = value.toLowerCase() === 'true';
  
  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked ? 'true' : 'false';
    onChange(propertyName, newValue, propertyType);
    
    if (onResetVisibilityChange) {
      const hasNonDefault = normalizeValue(newValue) !== normalizeValue(defaultValue);
      onResetVisibilityChange(hasNonDefault);
    }
  };

  return (
    <div class="control-container boolean-container">
      <input
        type="checkbox"
        class="property-editor boolean-editor"
        checked={isChecked}
        onChange={handleChange}
        data-property={propertyName}
        data-type={propertyType}
        data-default={defaultValue}
      />
      <span class="boolean-text">{isChecked ? 'On' : 'Off'}</span>
    </div>
  );
};

export const MultilineStringEditor: FunctionComponent<BaseEditorProps> = ({
  propertyName,
  value,
  propertyType,
  defaultValue,
  onChange,
  onResetVisibilityChange
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const newValue = target.value;
    setLocalValue(newValue);
    onChange(propertyName, newValue, propertyType);
    
    if (onResetVisibilityChange) {
      const hasNonDefault = normalizeValue(newValue) !== normalizeValue(defaultValue);
      onResetVisibilityChange(hasNonDefault);
    }
  };

  return (
    <textarea
      class="property-editor multiline-editor"
      rows={3}
      value={localValue}
      onChange={handleChange}
      data-property={propertyName}
      data-type={propertyType}
      data-default={defaultValue}
    />
  );
};

export const ReadonlyEditor: FunctionComponent<{ value: string }> = ({ value }) => {
  return (
    <div class="control-container">
      <span class="value-display readonly">{value}</span>
    </div>
  );
}; 
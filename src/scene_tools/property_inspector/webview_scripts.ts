export function getWebviewScripts(): string {
	return `
		// Acquire VS Code API once and reuse it
		const vscode = acquireVsCodeApi();
		console.log('VS Code API acquired successfully');

		// Utility function to normalize values for comparison (same logic as server-side)
		function normalizeValue(val) {
			if (!val) return '';
			
			// Remove quotes from string values for comparison
			if (val.startsWith && val.startsWith('"') && val.endsWith && val.endsWith('"')) {
				return val.slice(1, -1);
			}
			// Normalize boolean values
			if (val.toLowerCase && (val.toLowerCase() === 'true' || val.toLowerCase() === 'false')) {
				return val.toLowerCase();
			}
			// Normalize numeric values
			if (!isNaN(Number(val))) {
				return String(Number(val));
			}
			return val;
		}

		// Function to update reset button visibility for a property
		function updateResetButtonVisibility(element) {
			try {
				const propertyName = element.getAttribute('data-property');
				const defaultValue = element.getAttribute('data-default') || '';
				
				console.log('Updating reset button visibility for:', propertyName);
				
				// Get current value
				let currentValue;
				if (element.type === 'checkbox') {
					currentValue = element.checked ? 'true' : 'false';
				} else {
					currentValue = element.value;
				}

				// Compare normalized values
				const normalizedCurrent = normalizeValue(currentValue);
				const normalizedDefault = normalizeValue(defaultValue);
				const hasNonDefaultValue = normalizedCurrent !== normalizedDefault && 
											!(currentValue === '' && defaultValue === '');

				console.log('Comparing values - current:', normalizedCurrent, 'default:', normalizedDefault, 'hasNonDefaultValue:', hasNonDefaultValue);

				// Find the reset button for this property - use a more reliable approach
				const propertyRow = element.closest('.property-row');
				if (propertyRow) {
					// Find all reset buttons in this row and check their onclick attribute
					const buttons = propertyRow.querySelectorAll('button.reset-button');
					for (let i = 0; i < buttons.length; i++) {
						const button = buttons[i];
						const onclick = button.getAttribute('onclick') || '';
						if (onclick.indexOf('resetProperty(\\'' + propertyName + '\\')') >= 0) {
							if (hasNonDefaultValue) {
								button.style.display = 'inline-block';
								console.log('Showing reset button for', propertyName);
							} else {
								button.style.display = 'none';
								console.log('Hiding reset button for', propertyName);
							}
							break;
						}
					}
				} else {
					console.log('Could not find property row for', propertyName);
				}
			} catch (error) {
				console.error('Error updating reset button visibility:', error);
			}
		}

		function toggleSection(sectionId) {
			console.log('toggleSection called for:', sectionId);
			const section = document.getElementById(sectionId).parentElement;
			section.classList.toggle('collapsed');
		}

		function openDocumentation(className) {
			console.log('openDocumentation called for:', className);
			vscode.postMessage({
				type: 'openDocumentation',
				className: className
			});
		}

		function resetProperty(propertyName) {
			console.log('resetProperty called for:', propertyName);
			vscode.postMessage({
				type: 'propertyReset',
				propertyName: propertyName
			});
		}

		function updateProperty(element) {
			console.log('updateProperty called for element:', element);
			const propertyName = element.getAttribute('data-property');
			const propertyType = element.getAttribute('data-type');
			let newValue;

			// Get the value based on element type
			if (element.type === 'checkbox') {
				newValue = element.checked ? 'true' : 'false';
				
				// Update the boolean text display
				const booleanText = element.parentElement.querySelector('.boolean-text');
				if (booleanText) {
					booleanText.textContent = element.checked ? 'On' : 'Off';
				}
			} else {
				newValue = element.value;
			}

			console.log('Sending property change:', {propertyName: propertyName, newValue: newValue, propertyType: propertyType});

			// Update reset button visibility immediately
			updateResetButtonVisibility(element);

			// Send message to the extension
			vscode.postMessage({
				type: 'propertyChange',
				propertyName: propertyName,
				newValue: newValue,
				propertyType: propertyType
			});
		}

		// Initialize reset button visibility immediately (HTML is already loaded)
		console.log('Initializing reset button visibility');
		setTimeout(function() {
			try {
				const allEditors = document.querySelectorAll('.property-editor');
				console.log('Found', allEditors.length, 'editors for reset button initialization');
				for (let i = 0; i < allEditors.length; i++) {
					updateResetButtonVisibility(allEditors[i]);
				}
			} catch (error) {
				console.error('Error during initialization:', error);
			}
		}, 100);
	`;
} 
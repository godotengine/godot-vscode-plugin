const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig(
	{
		// version: '1.84.0',
		label: 'unitTests',
		files: 'out/**/*.test.js',
	}
);

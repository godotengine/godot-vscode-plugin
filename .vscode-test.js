const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig(
	{
		// version: '1.96.4',
		label: 'unitTests',
		files: 'out/**/*.test.js',
		launchArgs: ['--disable-extensions'],
		workspaceFolder: './test_projects/test-dap-project-godot4',
	}
);

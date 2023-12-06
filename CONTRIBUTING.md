# Contributing

### Building from source

#### Requirements

- [npm](https://www.npmjs.com/get-npm)

#### Process

1. Open a command prompt/terminal and browse to the location of this repository on your local filesystem.
2. Download dependencies by using the command `npm install`
3. When done, package a VSIX file by using the command `npm run package`.
4. Install it by opening Visual Studio Code, opening the Extensions tab, clicking on the More actions (**...**) button in the top right, and choose **Install from VSIX...** and find the compiled VSIX file.

When developing for the extension, you can open this project in Visual Studio Code and debug the extension by using the **Run Extension** launch configuration instead of going through steps 3 and 4. It will launch a new instance of Visual Studio Code that has the extension running. You can then open a Godot project folder and debug the extension or GDScript debugger.

Additionally, if you create a `workspace.code-workspace` file, you can use the **Run Extension with workspace file** launch configuration to quickly change what folder your Extension Host is running in, and quickly change the settings passed to the debug environment

An example `workspace.code-workspace` file:
```jsonc
{
	"folders": [
		{
			// "path": "."
			"path": "P:/project1"
			// "path": "P:/project2"
			// "path": "P:/folder/project3"
		}
	],
    "settings": {
		"godotTools.editorPath.godot3": "godot3.dev.exe",
		"godotTools.editorPath.godot4": "godot4.dev.exe",
		// "godotTools.editorPath.godot4": "godot4.custom.exe"
        // "godotTools.editorPath.godot4": "Godot_v4.1.1-stable_win64.exe",
        "godotTools.lsp.headless": false
	}
}
```

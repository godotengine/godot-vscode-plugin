A complete set of tools to code games with the [Godot game engine](http://www.godotengine.org/) in Visual Studio Code.

## Features

The extension comes with a wealth of features to make your Godot programming experience as comfortable as possible:

- Syntax highlighting for the GDscript (`.gd`) language
- Syntax highlighting for the `.tscn` and `.tres` scene formats
- Function definitions and documentation display on hover (see image below)
- Rich auto-completion
- Static code validation
- Open projects and scenes in Godot from VS Code
- Ctrl-click on a variable or method call to jump to its definition
- Full documentation of the Godot engine's API supported

![Showing the documentation on hover feature](img/godot-tools.jpg)

## Available Commands

The extension adds a few entries to the VS Code Command Palette under "GodotTools":

- Update workspace symbols
- Run workspace as Godot project
- Open workspace with Godot editor
- Run current scene

## Settings

### Godot

If you like this extension, you can set VS Code as your default script editor for Godot by following these steps:
1. Open editor settings
2. Select `Text Editor / External`
3. Make sure the `Use External Editor` box is checked
4. Fill `Exec Path` with the path to your VS Code executable
5. Fill `Exec Flags` with `{project} --goto {file}:{line}:{col}`

### VS Code

You can use the following settings to configure Godot Tools:
- **GodotTools.godotVersion** - The Godot version of your project.
- **GodotTools.editorPath** - The absolute path to the Godot executable. Required to run the project and test scenes directly from VS Code.
- **GodotTools.workspaceDocumentWithMarkdown** - Control how the documentation of workspace symbols should be rendered: as plain text or as HTML from Markdown.
- **GodotTools.ignoreIndentedVars** - Only parse variables defined on lines without an indentation.
- **GodotTools.parseTextScene** - Parse a file as a Godot scene when the file name ends with `.tscn`.
- **GodotTools.completeNodePath** - Show node paths within a workspace as part of code completion.
- **GodotTools.godotProjectRoot** - Your Godot project's directory, which contains `project.godot` or `engine.cfg`.

## Issues and Contributions

The [Godot Tools](https://github.com/GodotExplorer/godot-tools) extension and  [engine modules](https://github.com/GodotExplorer/editor-server) are both hosted on GitHub. Feel free to open issues there and create pull requests anytime.

See the [full changelog](https://github.com/GodotExplorer/godot-tools/blob/master/CHANGELOG.md) for the latest changes.

## FAQ
   
### Why isn't Intellisense showing up for me?

Make sure you save your `.gd` file, then run "GodotTools: Update Workspace Symbols" from the Command Palette.

## TODO:
* Convert official BBCode documentation into Markdown and render it into HTML with documentation previewer pages
* Add mermaid support with documentation
* Undefined variable checking

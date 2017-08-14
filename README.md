A complete set of tools to code games with the [Godot game engine](http://www.godotengine.org/) in Visual Studio Code.

## Features

The plug-in comes with a wealth of features to make your programming experience as comfortable as possible

- Syntax highlighting for the GDscript language
- Syntax highlighting for the tscn and tres scene formats
- Function definitions and documentation on hover
- Rich auto completion
- Static code validation
- Open projects and scenes in Godot from VScode
- Ctrl click on a variable or method call to jump to its definition
- Full documentation supported with API of godot engine

![Showing the documentation on hover feature](https://raw.githubusercontent.com/GodotExplorer/godot-tools/master/img/documentation-on-hover.png "Method definition and docs on hover")

## Available commands

The plug-ins adds a few entries to the command palette

- Update Workspace Symbols
- Run workspace as godot project
- Open workspace with godot editor
- Run current scene

## Settings

If you like this plugin you can set VSCode as your default script editor with following steps:
1. Open editor settings
2. Select `Text Editor / External`
3. Check the `Use External Editor` box with mouse click
4. Fill `Exec Path` to the path of your Visual Studio Code
5. Fill `Exec Flags` with `{project} --goto {file}:{line}:{col}`

You can use the following settings to setup the Godot Tools:
- GodotTools.godotVersion: The godot version of your project
- GodotTools.editorPath: An absolute path pointing at the Godot Editor executable file. Required to run the project and test scenes from VScode
- GodotTools.workspaceDocumentWithMarkdown: Control the documentations of workspace symbols should be rendered as plain text or html from markdown
- GodotTools.ignoreIndentedVars: Parse variables defined after indent of not
- GodotTools.parseTextScene: Parse scene files with extension ends with tscn
- GodotTools.completeNodePath: Show node paths of of workspace in the code completion

## Issues and contributions

The [Godot Tools](https://github.com/GodotExplorer/godot-tools) and the go to [engine modules](https://github.com/GodotExplorer/editor-server) are all hosted on GitHub. Feel free to open issues there and create pull requests anytime.

## FAQ
   
### Intelisense isn't showing up for me

Make sure you save your .gd file, then run "GodotTools: Update Workspace Symbols" from the command palate

## Release Notes

### 0.2.9
* Add configuration `GodotTools.completeNodePath` to switch is complete node paths
* Enhanced syntax highlight with GDScript
* Enhanced code completion with GDScript

### 0.2.8
* Add godot 3.0 project support with configuration `GodotTools.parseTextScene` >= 3
* Add configuration `GodotTools.parseTextScene` to allow disable node path parsing
* Remove `GodotTools.editorServerPort` configuration

### 0.2.7

* Fix some error with syntax checking
* Add symbol support for enumerations
* Remove key bindings for `F5`~`F8` as it might be conflict with other functionalities of VSCode
    * You can bind the key bindings back by add following configurations
    ```json
    {
        "command": "godot.runWorkspace",
        "key": "F5"
    },
    {
        "command": "godot.runCurrentScene",
        "key": "F6"
    },
    {
        "command": "godot.openWithEditor",
        "key": "F7"
    },
    {
        "command": "godot.updateWorkspaceSymbols",
        "key": "F8"
    }
    ```
    For more references please ready [keybindings](https://code.visualstudio.com/docs/getstarted/keybindings)

[Full change log](https://github.com/GodotExplorer/godot-tools/blob/master/CHANGELOG.md)

## TODOS:
* Convert official BBCode documentation into Markdown and render it to HTML with documentation previewer pages
* Add mermaid support with documentation
* Undefined variable checking

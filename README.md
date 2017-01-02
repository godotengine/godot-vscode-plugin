A complete set of tools to code games with the [Godot game engine](http://www.godotengine.org/) in Visual Studio Code.

## Features

The plug-in comes with a wealth of features to make your programming experience as comfortable as possible

- Syntax highlighting for the GDscript language
- Syntax highlighting for the tscn and tres scene formats
- Function definitions and documentation on hover
- Rich auto completion
- Static code validation
- Open projects and scenes in Godot from VScode
- Ctrl click on a variable or method call to jump to its definition (_new in 0.1.3_)

## Available commands

The plug-ins adds a few entries to the command palette

- Update Workspace Symbols
- Run workspace as godot project
- Open workspace with godot editor
- Run current scene

## Settings

You can use the following settings to setup the Godot Tools:

- GodotTools.editorServerPort: The http server port used by the EditorServer Godot module (_see Extra Functionality below_)
- GodotTools.maxNumberOfProblems: Sets the limit for the issues reported by the static code validator
- GodotTools.editorPath: An absolute path pointing at the Godot Editor executable file. Required to run the project and test scenes from VScode


## Extra functionality

If you want to get an even better experience with this plug-in, you can extend its functionality using the following modules and VScode extensions:

### Godot modules

These are modules for the goats editor itself, programmed in C++. In order to use them, you have to create a [custom build](http://docs.godotengine.org/en/stable/reference/compiling_for_windows.html) of the engine. Only do that if you know what you're doing.

- [EditorServer](https://github.com/GodotExplorer/editor-server/tree/master/editor_server): Using HTTP requests, this module gets extra information from Godot to improve autocompletion.
- [VSCode](https://github.com/GodotExplorer/editor-server/tree/master/vscode_tools): The VS code module generates a setting file that Visual Studio code can use to generate Tasks automatically.

### VScode extensions

- [TOML language](https://marketplace.visualstudio.com/items?itemName=be5invis.toml): Godot uses this minimal language to store settings. For example in your project config file. If you want to get syntax highlighting for these files, you will have to install the TOML language extension.

## Issues and contributions

The [Godot Tools](https://github.com/GodotExplorer/godot-tools) and the go to [engine modules](https://github.com/GodotExplorer/editor-server) are all hosted on GitHub. Feel free to open issues there and create pull requests anytime.

## Release Notes

### 0.1.3

- Better syntax highlight for GDScript
- Add mouse hover information support
- Add definition provider for GDScript

### 0.1.2

- Multiline string and StringName highlight support
- Builtin classes, properties, functions and constants highlight support
- Fix errors in code snipt

### 0.1.1

- Better syntax highlit with GDScript

### 0.1.0

- Initial release
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
- Run/debug the godot game with VSCode with F5(coming soon) 

![Showing the documentation on hover feature](https://raw.githubusercontent.com/GodotExplorer/godot-tools/master/img/documentation-on-hover.png "Method definition and docs on hover")

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
- GodotTools.workspaceDocumentWithMarkdown: Control the documentations of workspace symbols should be rendered as plain text or html from markdown
- GodotTools.ignoreIndentedVars: Parse variables defined after indent of not

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

### 0.2.6

* Add shorthand if else expression support
* Add `enum` and `match` expression support
* Fix bugs with syntax checking
* Updated documentation data with godot 2.1.3
* Add syntax checking for end of expression
* The pulugin is compiled with latest VSCode thanks @arrkiin
* Add key bindings for open workspace with godot editor with `F7` and update workspace symbols with `F8`

### 0.2.5

* Run games within VSCode terminals
* Add key bindings for `F5 to run the workspace` and `F6 to run the edting scene`
* Fix a lot of bugs with unused vaiable cheching
* Move workspace symbols state notice to status bar

### 0.2.4

* Add code cheching for asignments and comparations
* Impoved builtin documentation preview page
* Fix bugs with unused vaiable cheching

[Read more from the full change log](https://github.com/GodotExplorer/godot-tools/blob/master/CHANGELOG.md)


## TODOS:
* Convert official BBCode documentation into Markdown and render it to HTML with documentation previewer pages
* Add mermaid support with documentation
* Undefine variable checking
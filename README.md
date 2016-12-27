Tools for Visual Studio Code to make game development better with the [Godot Game Engine](http://www.godotengine.org/).

## Features

The plugin make it is possible to code GDScript with Visual Studio Code feel like in Godot Editor.

* GDScript syntax highlight
* `tres` and `tscn` syntax highlight
* Code completion
* Static code validating
* Run project or opened scene

## Commands

* Update Workspace Symbols
* Run workspace as godot project
* Open workspace with godot editor
* Run current scene


## Requirements

Optional modules for godot editor should improve the functionality of the tools 

* [EditorServer](https://github.com/GodotExplorer/editor-server/tree/master/editor_server) provide a informations from godot editor by HTTP requirests
* [VSCode](https://github.com/GodotExplorer/editor-server/tree/master/vscode_tools) to generate settings for your projects into `.vscode` which could be used by this plugin
* [TOML](https://marketplace.visualstudio.com/items?itemName=be5invis.toml) language for syntax highlight with text resources

## Extension Settings

This extension contributes the following settings:

* `GodotTools.editorServerPort`: The http server port of the EditorServer module plugin 


* `GodotTools.maxNumberOfProblems`: The maxmum number of problems in your workspace 

*  `GodotTools.editorPath`: The absolute path of your godot editor to run projects and scenes

## Known Issues

Please feel free to open issues and pull requirests on github about the [Godot-Tools](https://github.com/GodotExplorer/godot-tools) plugin and [the modules](https://github.com/GodotExplorer/editor-server). 

## Release Notes

### 0.1.0 Initialize publish
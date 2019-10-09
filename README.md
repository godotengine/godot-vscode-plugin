A complete set of tools to code games with the [Godot game engine](http://www.godotengine.org/) in Visual Studio Code.

**IMPORTANT NOTE**
This version of plugin only support godot 3.2 and above.

## Features

The extension comes with a wealth of features to make your Godot programming experience as comfortable as possible:

- Syntax highlighting for the GDScript (`.gd`) language
- Syntax highlighting for the `.tscn` and `.tres` scene formats
- Full Typed GDScript support
- Optional `Smart Mode` to speed up dynamic typed script coding
- Function definitions and documentation display on hover (see image below)
- Rich auto-completion
- Display script warnings and errors
- Ctrl-click on a variable or method call to jump to its definition
- Full documentation of the Godot engine's API supported
- Run godot project from VS Code

![Showing the documentation on hover feature](img/godot-tools.png)

## Available Commands

The extension adds a few entries to the VS Code Command Palette under "GodotTools":

- Open workspace with Godot editor
- Run workspace as Godot project
- List native classes of godot

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
- **editor_path** - The absolute path to the Godot editor executable
- **gdscript_lsp_server_port** - The websocket server port of the GDScript language server
- **check_status** - Check the GDScript language server connection status

## Issues and Contributions

The [Godot Tools](https://github.com/godotengine/godot-vscode-plugin) extension is an open source project of godot orgnization. Feel free to open issues and create pull requests anytime.

See the [full changelog](https://github.com/GodotExplorer/godot-tools/blob/master/CHANGELOG.md) for the latest changes.

## FAQ

### Why failed to connect to language server?
- You may not open your project with godot editor.
- Godot 3.2 and above is required.

### Why isn't intellisense showing up my script members for me?
- The GDScript is a dynamic typed script language the tool may can infer all the variable types as you want.
- You can turn on the `Smart Mode` in godot editor `Editor Settings > Language Server` check the `Enable Smart Resolve`.

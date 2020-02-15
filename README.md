# Godot Tools

A complete set of tools to code games with
[Godot Engine](http://www.godotengine.org/) in Visual Studio Code.

**IMPORTANT NOTE:** Versions 1.0.0 and later of this plugin only support
Godot 3.2 or later.

## Features

The extension comes with a wealth of features to make your Godot programming
experience as comfortable as possible:

- Syntax highlighting for the GDScript (`.gd`) language
- Syntax highlighting for the `.tscn` and `.tres` scene formats
- Full typed GDScript support
- Optional "Smart Mode" to improve productivity with dynamically typed scripts
- Function definitions and documentation display on hover (see image below)
- Rich autocompletion
- Display script warnings and errors
- Ctrl + click on a variable or method call to jump to its definition
- Full documentation of the Godot Engine's API supported
- Run a Godot project from VS Code

![Showing the documentation on hover feature](img/godot-tools.png)

## Available commands

The extension adds a few entries to the VS Code Command Palette under "Godot Tools":

- Open workspace with Godot editor
- Run the workspace as a Godot project
- List Godot's native classes


## Settings

### Godot

If you like this extension, you can set VS Code as your default script editor
for Godot by following these steps:

1. Open the **Editor Settings**
2. Select **Text Editor > External**
3. Make sure the **Use External Editor** box is checked
4. Fill **Exec Path** with the path to your VS Code executable
5. Fill **Exec Flags** with `{project} --goto {file}:{line}:{col}`

### VS Code

You can use the following settings to configure Godot Tools:

- `editor_path` - The absolute path to the Godot editor executable.
- `gdscript_lsp_server_port` - The WebSocket server port of the GDScript language server.
- `check_status` - Check the GDScript language server connection status.

#### Use Godot Tools in your VSCode Extension
If you have a VSCode plugin there are some commands that are only available via code that may be helpful.  This means your extension will require that this extension is installed.

You can invoke other commands (Godot Tools, built-ins, or other plugins) with 
```typescript
vscode.commands.executeCommand('extension.command')
// or with parameters
vscode.commands.executeCommand('extension.command', p1, p2, p3 ...)
```

#### Godot Tools offers:

`godot-tools.run_godot` <br/>
This will launch godot, you can optionally give  it a string of arguments.
```typescript
// launch godot to run the current workspace
vscode.commands.executeCommand('godot-tool.run_godot', `--path "${this.workspace_dir}"`);
// run a scene
vscode.commands.executeCommand('godot-tool.run_godot', `--path "${this.workspace_dir}" path/to/scene.tscn`);

```

## Issues and contributions

The [Godot Tools](https://github.com/godotengine/godot-vscode-plugin) extension
is an open source project from the Godot orgnization. Feel free to open issues
and create pull requests anytime.

See the [full changelog](https://github.com/GodotExplorer/godot-tools/blob/master/CHANGELOG.md)
for the latest changes.

## FAQ

### Why does it fail to connect to the language server?

- Godot 3.2 or later is required.
- Make sure to open the project in the Godot editor first. If you opened
  the editor after opening VS Code, you can click the **Retry** button
  in the bottom-right corner in VS Code.

### Why isn't IntelliSense displaying script members?

- GDScript is a dynamically typed script language. The language server can't
  infer all variable types.
- To increase the number of results displayed, open the **Editor Settings**,
  go to the **Language Server** section then check **Enable Smart Resolve**.

# Godot Tools for C#

A fork of [godot-vscode-plugin](https://github.com/godotengine/godot-vscode-plugin) with **Active Scene Tree and Inspector support for C# projects**.

---

## C# Scene Tree Support

This fork adds the ability to view the **Active Scene Tree** and **Inspector** when debugging Godot 4 C# projects - features that were previously only available for GDScript debugging.

### Features for C# Projects

| Feature | Original (GDScript only) | This Fork (C# Support) |
|---------|-------------------------|------------------------|
| Active Scene Tree | GDScript only | **Works with C#** |
| Node Inspector | GDScript only | **Works with C#** |
| Auto-refresh Scene Tree | GDScript only | **Works with C#** |
| Auto-refresh Inspector | GDScript only | **Works with C#** |

### How It Works

The extension starts a TCP server that Godot connects to via its `--remote-debug` flag. This allows the extension to receive scene tree data independently of the C# debugger (which uses a separate debug protocol).

---

## Setup Instructions

### Prerequisites

- **Godot 4.2+** (with C# support / .NET version)
- **VS Code** with the C# extension installed
- **.NET SDK** installed and configured

### Step 1: Install the Extension

Download the `.vsix` file from [Releases](https://github.com/DanTrz/godot-vscode-plugin-csharp/releases) and install it:
1. Open VS Code
2. Press `Ctrl+Shift+P` and run "Extensions: Install from VSIX..."
3. Select the downloaded `.vsix` file

### Step 2: Configure launch.json

Add the `--remote-debug` flag to your launch configuration. This tells Godot to connect to the Scene Tree Monitor.

**Example launch.json:**

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Play",
            "type": "coreclr",
            "request": "launch",
            "preLaunchTask": "build",
            "program": "${env:GODOT4}", //Or your Path to Godot
            "args": [
                "--remote-debug", //MUST INCLUDE
                "tcp://127.0.0.1:6007" //MUST INCLUDE - Check the port in settings
            ],
            "cwd": "${workspaceFolder}",
            "stopAtEntry": false
        }
    ]
}
```

**Key addition:** The `--remote-debug tcp://127.0.0.1:6007` argument.

> **Note:** The port `6007` is the default. You can change it in VS Code settings under `godotTools.sceneTreeMonitor.port`.


## Workflow

1. **Open your Godot C# project** in VS Code
2. **Press F5** to start debugging
3. The Scene Tree Monitor **auto-starts** and waits for Godot
4. Godot launches and **connects automatically** (via `--remote-debug`)
5. The **Active Scene Tree** populates with your running scene
6. **Click the eye icon** on any node to inspect its properties
7. **Stop debugging** - Scene Tree Monitor stops automatically

### Inspector Panel

- Located in the Explorer sidebar under "Inspector"
- Shows properties of the selected node
- Auto-refreshes along with the Scene Tree (configurable)

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `godotTools.sceneTreeMonitor.port` | `6007` | Port for Godot to connect to |
| `godotTools.sceneTreeMonitor.autoStart` | `true` | Auto-start when C# debug session begins |
| `godotTools.sceneTreeMonitor.refreshInterval` | `500` | Auto-refresh interval in ms (0 to disable) |

---

## Troubleshooting

### Scene Tree not populating?

1. **Check your launch.json** - make sure `--remote-debug tcp://127.0.0.1:6007` is included in args
2. **Check the port** - ensure the port in launch.json matches `godotTools.sceneTreeMonitor.port` setting and your Godot settings
3. **Check Godot version** - requires Godot 4.2 or later

### "Connection refused" error?

This happens if Godot tries to connect before the Scene Tree Monitor is ready. The auto-start feature should handle this, but if you're starting Godot manually, ensure the monitor is running first.

### Inspector shows "Node has not been inspected"?

Click the **eye icon** next to a node in the Active Scene Tree to inspect it.

---

## Original Godot Tools Features

This fork includes all original features from [godot-vscode-plugin](https://github.com/godotengine/godot-vscode-plugin):

- GDScript language support (syntax highlighting, completions, formatting)
- GDScript debugger (for GDScript projects)
- GDResource/GDShader syntax highlighting
- Scene preview
- And more...

See the [original README](https://github.com/godotengine/godot-vscode-plugin#readme) for full documentation.

---

## Contributing

Issues and pull requests welcome at [github.com/DanTrz/godot-vscode-plugin-csharp](https://github.com/DanTrz/godot-vscode-plugin-csharp).

This is a fork maintained separately from the original project.

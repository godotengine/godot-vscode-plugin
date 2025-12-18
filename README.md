# Godot Tools C# (Fork)

A fork of [godot-vscode-plugin](https://github.com/godotengine/godot-vscode-plugin) with **C# enhancements** for Godot 4 development.

---

## 🎯 Key Features

### 1. C# Drag & Drop Code Generation

Drag nodes from the **Scene Preview** panel directly into your C# scripts to automatically generate node reference code.

#### How to Use

1. Open a `.tscn` file to see the **Scene Preview** in the sidebar
2. Open your C# script (`.cs` file)
3. **Drag any node** from the Scene Preview into your script
4. Code is automatically generated based on your preferred style

#### Code Styles

| Style | Generated Code |
|-------|----------------|
| **[Export] public** | `[Export] public Button MyButton { get; set; }` |
| **[Export] private** | `[Export] private Button _myButton { get; set; }` |
| **Lazy field (C# 14)** | `Button _myButton => field ??= GetNode<Button>("path");` |
| **Expression-bodied** | `Button MyButton => GetNode<Button>("path");` |

#### Configuration

Set your preferred default style in VS Code settings:

```
Settings > Godot Tools > C# > Node Reference Style
```

Or in `settings.json`:
```json
"godotTools.csharp.nodeReferenceStyle": "exportPublic"
```

Options: `exportPublic`, `exportPrivate`, `lazyField`, `expressionBodied`

> **Tip:** When dropping on an empty line, your default style is used automatically. No dialog needed!

---

### 2. Active Scene Tree for C# Debugging

View the **running scene tree** and **inspect node properties** during C# debugging - features previously only available for GDScript.

| Feature | Original Plugin | This Fork |
|---------|-----------------|-----------|
| Active Scene Tree | GDScript only | ✅ **Works with C#** |
| Node Inspector | GDScript only | ✅ **Works with C#** |
| Auto-refresh | GDScript only | ✅ **Works with C#** |

#### Setup for Scene Tree Monitor

**Step 1:** Add `--remote-debug` to your `launch.json`:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Play",
            "type": "coreclr",
            "request": "launch",
            "preLaunchTask": "build",
            "program": "${env:GODOT4}",
            "args": [
                "--remote-debug",
                "tcp://127.0.0.1:6007"
            ],
            "cwd": "${workspaceFolder}",
            "stopAtEntry": false
        }
    ]
}
```

**Step 2:** Press F5 to debug. The Scene Tree Monitor auto-starts.

**Step 3:** Click the **eye icon** on any node to inspect its properties.

#### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `godotTools.sceneTreeMonitor.port` | `6007` | Port for Godot connection |
| `godotTools.sceneTreeMonitor.autoStart` | `true` | Auto-start on C# debug |
| `godotTools.sceneTreeMonitor.refreshInterval` | `500` | Refresh interval (ms) |

---

## Installation

### Prerequisites

- **Godot 4.2+** (.NET version)
- **VS Code** with C# extension
- **.NET SDK** installed

### Install from VSIX

1. Download `.vsix` from [Releases](https://github.com/DanTrz/godot-vscode-plugin-csharp/releases)
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded file

---

## Troubleshooting

### Scene Tree not populating?

1. Check `--remote-debug tcp://127.0.0.1:6007` is in your launch.json args
2. Verify port matches `godotTools.sceneTreeMonitor.port` setting
3. Requires Godot 4.2+

### Drag & Drop not working?

1. Make sure you're dragging from **Scene Preview** (not file explorer)
2. Target must be a `.cs` file
3. The Scene Preview panel shows nodes from `.tscn` files

---

## Original Features

This fork includes all features from [godot-vscode-plugin](https://github.com/godotengine/godot-vscode-plugin):

- GDScript language support
- GDScript debugger
- Scene Preview
- GDShader support
- And more...

---

## Contributing

Issues and PRs welcome at [github.com/DanTrz/godot-vscode-plugin-csharp](https://github.com/DanTrz/godot-vscode-plugin-csharp)

*Based on [godot-vscode-plugin](https://github.com/godotengine/godot-vscode-plugin) by the Godot Engine community*

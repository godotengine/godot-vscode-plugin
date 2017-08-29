# Change Log

### 0.3.0
* Add project root configuration settings as `GodotTools.godotProjectRoot` thanks Konstantin Zaitcev
* Add auto indent support for gdscript language
* More friendly with godot 3.0 alpha
* Updated script snippets
* Fix highglight error with gdscript language
* Limited code completions

### 0.2.9
* Add configuration `GodotTools.completeNodePath` to switch is complete node pathes
* Enhanced syntax highlight with GDScript
* Enhanced code completion with GDScript

### 0.2.8
* Add godot 3.0 project support with configuration `GodotTools.parseTextScene` >= 3
* Add configuration `GodotTools.parseTextScene` to allow disable node path parsing
* Remove `GodotTools.editorServerPort` configuration

### 0.2.7

* Fix some error with syntax checking
* Add symbol support for enumerations
* Remove key bindings for `F5`~`F8` as it might be confict with other functionalities of VSCode
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

### 0.2.3
* Fix known errors with code syntax checking
* Add configuration `ignoreIndentedVars` to allow ignore indented variables in scripts
* Enhanced hover tip documentation rendering with code examples
* Add launch configurations to launch game with F5(expiremental)

### 0.2.2
* Better Syntax validating for code blocks
* More waring for non-python liked expression

### 0.2.1
* Support markdown render in hover tips for documentations in workspace symbols
* Add configuration `GodotTools.workspaceDocumentWithMarkdown` to control workspace documentation rendering

### 0.2.0

* Show autoloads informations in hover tips and go to autoloads' definitions are supported now
* Fix the bug that workspace symbols resoved twice on Windows

### 0.1.9

* Show workspace constant value in hover tips and completion items
* More readable style for links in documentation preview page
* Improve code completion sort order and auto insert `()` for functions without paramaters
* Fix bugs with workspace documentation parsing

### 0.1.8

* Show signatures on completion label
* More reliable unused variable and constant checking in documente
* Show workspace documentations and function signatures in completions

### 0.1.7

* Show documentations parsed from GDScripts in hover tips

### 0.1.6

* Reorder mouse hover tips, builtin methods are at top of workspace methods
* Show callabel signatures with documente symbols and workspace symbols
* Syntax highlight support for signal paramaters

### 0.1.5

* Add function signature hint support
* Better syntax grammar checking
* Better hover hint message for workspace methods and signals

### 0.1.4

* Add documentation support for builtin Symbols.
* Improve speed of syntax parsing and other actions

### 0.1.3

* Better syntax highlight for GDScript
* Add mouse hover information support
* Add definition provider for GDScript

### 0.1.2
* Multiline string and `StringName` highlight support
* Builtin classes, properties, functions and constants highlight support
* Fix errors in code snipt

### 0.1.1
* Better syntax highlight with GDScript

### 0.1.0
* Initial release

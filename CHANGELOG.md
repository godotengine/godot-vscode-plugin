# Changelog

### 2.5.1

- [Fix "Request textDocument/documentSymbol failed" error when opening a GDScript file](https://github.com/godotengine/godot-vscode-plugin/pull/823)

### 2.5.0

- [**Add `print_rich()` support to debug console**](https://github.com/godotengine/godot-vscode-plugin/pull/792)
- [Improve Scene Preview drag-and-drop behavior](https://github.com/godotengine/godot-vscode-plugin/pull/815)
- [Add snippet/placeholder behavior to Scene Preview file drops](https://github.com/godotengine/godot-vscode-plugin/pull/813)
- [Overhaul the DebugAdapter variables in DAP](https://github.com/godotengine/godot-vscode-plugin/pull/793)
- [Fix opening a Godot project in Visual Studio Code before the editor resulting in bad file requests](https://github.com/godotengine/godot-vscode-plugin/pull/816)
- [Fix some GDScript syntax highlighting and formatting issues](https://github.com/godotengine/godot-vscode-plugin/pull/783)
- [Fix attached debugging](https://github.com/godotengine/godot-vscode-plugin/pull/784)
- [Fix multi-packet reponses breaking things when starting or ending in a multi-byte UTF-8 sequence](https://github.com/godotengine/godot-vscode-plugin/pull/797)

### 2.4.0

- [**Implement warnings and errors in debug console**](https://github.com/godotengine/godot-vscode-plugin/pull/749)
  - The items are expandable/collapsible, and the links on the right side of the panel work for any file inside the user's project
- [**Improve GDScript formatter**](https://github.com/godotengine/godot-vscode-plugin/pull/746)
  - Add new style of formatter snapshot tests
  - Add many new test cases
  - Fix several issues ([#728](https://github.com/godotengine/godot-vscode-plugin/pull/728), [#624](https://github.com/godotengine/godot-vscode-plugin/pull/624), [#657](https://github.com/godotengine/godot-vscode-plugin/pull/657), [#717](https://github.com/godotengine/godot-vscode-plugin/pull/717), [#734](https://github.com/godotengine/godot-vscode-plugin/pull/734), likely more)
- [**Add debugger support for typed Dictionaries**](https://github.com/godotengine/godot-vscode-plugin/pull/764)
- [Add some useful GDScript snippets for Godot 4](https://github.com/godotengine/godot-vscode-plugin/pull/794)
- [Add setting to enable/disable documentation minimap](https://github.com/godotengine/godot-vscode-plugin/pull/786)
- [Add newline when dropping nodes into editor](https://github.com/godotengine/godot-vscode-plugin/pull/754)
- [Add `@static_unload` annotation and Godot 4.3 Variant types to syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/738)
- [Overhaul LSP client](https://github.com/godotengine/godot-vscode-plugin/pull/752)
  - Simplify LSP client internals
  - Streamline control flow between Client, IO, and Buffer classes
  - Create canonical, obvious place to implement filters on incoming and outgoing LSP messages
  - Remove legacy WebSockets-based LSP support
- [Update float syntax rules and formatting to better support complex cases](https://github.com/godotengine/godot-vscode-plugin/pull/756)
- [Implement Godot-in-the-loop test suite and fix debugger errors](https://github.com/godotengine/godot-vscode-plugin/pull/788)
- [Remove OS, GDScript and Object from the list of builtins in syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/739)
- [Fix typed arrays of scripts not being decoded properly](https://github.com/godotengine/godot-vscode-plugin/pull/731)
- [Fix debugger watch window freeze caused by missing responses](https://github.com/godotengine/godot-vscode-plugin/pull/781)
- [Fix the TextMate grammar erroneously tagging enum members and const variables as language constants](https://github.com/godotengine/godot-vscode-plugin/pull/737)
- [Fix VBoxContainer and HBoxContainer documentation not opening](https://github.com/godotengine/godot-vscode-plugin/pull/755)

### 2.3.0

- [Add documentation page scaling feature](https://github.com/godotengine/godot-vscode-plugin/pull/722)
- [Suppress "workspace/symbol" not found error](https://github.com/godotengine/godot-vscode-plugin/pull/723)
- [Capitalize the drive letter in Windows absolute paths](https://github.com/godotengine/godot-vscode-plugin/pull/727)

### 2.2.0

- [Add partial debugger support for new types (such as typed arrays)](https://github.com/godotengine/godot-vscode-plugin/pull/715)
- [Fix bare nodepaths referencing absolute/root paths](https://github.com/godotengine/godot-vscode-plugin/pull/712)
- [Add `@export_custom` and `@export_storage` to syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/702)
- [Fix format_documentation for `[code skip-lint]`](https://github.com/godotengine/godot-vscode-plugin/pull/700)
- [Update Godot icons included in the extension](https://github.com/godotengine/godot-vscode-plugin/pull/711)

### 2.1.0

- [Improve dragging items from Scene Preview into source code](https://github.com/godotengine/godot-vscode-plugin/pull/661)
- [Improve macOS path resolution for app bundles](https://github.com/godotengine/godot-vscode-plugin/pull/632)
- [Improve codeblock formatting in documentation](https://github.com/godotengine/godot-vscode-plugin/pull/629)
- [Improve Scene Preview ergonomics](https://github.com/godotengine/godot-vscode-plugin/pull/665)
  - "Pinning" in the scene preview is now referred to as "locking" to avoid confusion with pinning a scene as the debug/launch target.
  - Added commands for opening the Scene Preview's target scene, and the "main script" of the target scene, if it exists.
  - Added existing "refresh scene preview" command as a button.
- [Prevent document links from accidentally being resolved to your entire document](https://github.com/godotengine/godot-vscode-plugin/pull/639)
- [Fix poor documentation formatting of class titles and inheritance chain](https://github.com/godotengine/godot-vscode-plugin/pull/628)
- [Fix bad formatting on several operators](https://github.com/godotengine/godot-vscode-plugin/pull/605)
- [Fix various formatting issues](https://github.com/godotengine/godot-vscode-plugin/pull/672)
- [Fix various syntax highlighting issues](https://github.com/godotengine/godot-vscode-plugin/pull/674)
- [Fix Object ID decoded as wrong signedness](https://github.com/godotengine/godot-vscode-plugin/pull/670)
- [Fix project not found when `project.godot` file is excluded](https://github.com/godotengine/godot-vscode-plugin/pull/635)
- [Fix LSP connection attempts not resetting](https://github.com/godotengine/godot-vscode-plugin/pull/638)
- [Fix child processes not being killed properly](https://github.com/godotengine/godot-vscode-plugin/pull/613)
- [Fix broken scene file parser](https://github.com/godotengine/godot-vscode-plugin/pull/603)
- [Fix debugged process not being terminated when debugging session closes on Linux](https://github.com/godotengine/godot-vscode-plugin/pull/620)

### 2.0.0

- [**Rewrite debugger for Godot 4 support + improved maintainability**](https://github.com/godotengine/godot-vscode-plugin/pull/452)
- [**Implement headless LSP mode**](https://github.com/godotengine/godot-vscode-plugin/pull/488)
- [**Add scene preview panel**](https://github.com/godotengine/godot-vscode-plugin/pull/413)
- [**Replace temporary `.gdshader` syntax with more extensive support**](https://github.com/godotengine/godot-vscode-plugin/pull/360)
- [Add "additional options" to launch debugger with](https://github.com/godotengine/godot-vscode-plugin/pull/363)
- [Add "Open Type Documentation" context menu option](https://github.com/godotengine/godot-vscode-plugin/pull/405)
- [Add `_physics_process` snippet](https://github.com/godotengine/godot-vscode-plugin/pull/411)
- [Add `_unhandled_input` snippet](https://github.com/godotengine/godot-vscode-plugin/pull/422)
- [Add highlighting support for %Unique nodes in NodePaths](https://github.com/godotengine/godot-vscode-plugin/pull/403)
- [Adjust Godot version detection regex](https://github.com/godotengine/godot-vscode-plugin/pull/526)
- [Fix BBCode [br] not rendering in hover](https://github.com/godotengine/godot-vscode-plugin/pull/557)
- [Fix errors in grammar syntax](https://github.com/godotengine/godot-vscode-plugin/pull/416)
- [Fix Godot 4.x debug console printing multiple logs into one line](https://github.com/godotengine/godot-vscode-plugin/pull/571)
- [Fix internal document link handling](https://github.com/godotengine/godot-vscode-plugin/pull/410)
- [Fix overaggressive formatting when adding lines after `if` statement](https://github.com/godotengine/godot-vscode-plugin/pull/385)
- [Fix func keyword highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/398)
- [Fix OS singleton being incorrectly highlighted as a constant](https://github.com/godotengine/godot-vscode-plugin/pull/402)
- [Fix incorrect highlighting in dictionary literals](https://github.com/godotengine/godot-vscode-plugin/pull/419)
- [Fix various highlighting errors](https://github.com/godotengine/godot-vscode-plugin/pull/407)
- [Fix various syntax highlighting problems](https://github.com/godotengine/godot-vscode-plugin/pull/441)
- [Improve debugger setup instructions](https://github.com/godotengine/godot-vscode-plugin/pull/491)
- [Improve displaying symbols documentation](https://github.com/godotengine/godot-vscode-plugin/pull/404)
- [Improve extension startup performance](https://github.com/godotengine/godot-vscode-plugin/pull/408)
- [Improve LSP connection behavior (fixes Godot3/4 port issue) ](https://github.com/godotengine/godot-vscode-plugin/pull/511)
- [Improve path handling when starting processes](https://github.com/godotengine/godot-vscode-plugin/pull/575)
- [Make launching the editor open a new custom terminal](https://github.com/godotengine/godot-vscode-plugin/pull/561)
- [Reorganize extension entrypoint](https://github.com/godotengine/godot-vscode-plugin/pull/505)
- [Restructure and rename settings](https://github.com/godotengine/godot-vscode-plugin/pull/376)
- [Multiple highlighting improvements](https://github.com/godotengine/godot-vscode-plugin/pull/506)
- [Syntax highlighting changes](https://github.com/godotengine/godot-vscode-plugin/pull/515)
- [Update `.gdshader` syntax](https://github.com/godotengine/godot-vscode-plugin/pull/397)
- [Various highlighting/formatting fixes](https://github.com/godotengine/godot-vscode-plugin/pull/559)
- [Various quality-of-life improvements](https://github.com/godotengine/godot-vscode-plugin/pull/529)
  - **Add GDScript formatter**
  - Add (disabled) experimental providers for custom completions, semantic tokens, and tasks
  - Add a file decorator to show the pinned debug file in the filesystem view/editor tabs
  - Add buttons for relevant actions to ScenePreview items
  - Add hover for SubResource() and ExtResource() statements in scene files
  - Add internal document links for SubResource() and ExtResource() statements in scene files
  - Add item decorators to the Scene Preview to show Node attributes more clearly
  - Fix scene file highlighting not working
  - Fix ScenePreview not working in Godot 3
  - Improve "Debug Pinned Scene" command by making the pinned scene persist between VSCode sessions
  - Improve ability to right click -> open docs for methods of builtin types (doesn't always work)
  - Overhaul documentation viewer
  - Update Godot icons (and remove old ones)

### 1.3.1

- [Fix regression in launching debugger](https://github.com/godotengine/godot-vscode-plugin/pull/371)
- [Fix operator syntax highlighting when next to an opening parenthesis](https://github.com/godotengine/godot-vscode-plugin/pull/375)

### 1.3.0

- [Add context menu options to copy resource path](https://github.com/godotengine/godot-vscode-plugin/pull/357)
- [Add option to run the project with visible collision shapes and navigation](https://github.com/godotengine/godot-vscode-plugin/pull/312)
- [Overhaul syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/342)
- [Mention that the Godot editor must be running in connection error message](https://github.com/godotengine/godot-vscode-plugin/pull/358)
- [Fix automatic indentation on line breaks not working as expected](https://github.com/godotengine/godot-vscode-plugin/pull/344)

### 1.2.0

- [Add support for setting language-server-host](https://github.com/godotengine/godot-vscode-plugin/pull/297)
- [Improve syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/330)
- [Update LSP client to 7.0.0 to use the 3.16.0 specification](https://github.com/godotengine/godot-vscode-plugin/pull/264)
- [Fix some `$` node path shorthand regex bugs in syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/340)
- [Fix handling of Windows terminals determined by profiles](https://github.com/godotengine/godot-vscode-plugin/pull/303)
- [Fix "static func" indent error](https://github.com/godotengine/godot-vscode-plugin/pull/279)
- [Fix restart of debugging sessions](https://github.com/godotengine/godot-vscode-plugin/pull/327)
- [Use the LSP defined SymbolKind enum and fix marked](https://github.com/godotengine/godot-vscode-plugin/pull/325)
- [Fix "Continue" for multiple breakpoints in the same script](https://github.com/godotengine/godot-vscode-plugin/pull/324)

### 1.1.3

- [Fix conditional breakpoints being parsed as regular breakpoints](https://github.com/godotengine/godot-vscode-plugin/pull/278)
- [Add `in` to the list of keywords and add rule for `$` shorthand](https://github.com/godotengine/godot-vscode-plugin/pull/274)
- [Fix typo in snippets: "decleration" -> "declaration"](https://github.com/godotengine/godot-vscode-plugin/pull/262)
- [Add `remote` keyword to syntax highlighting](https://github.com/godotengine/godot-vscode-plugin/pull/257)
- [Remove the configuration item `godot-tools.check_config` as it has no effect](https://github.com/godotengine/godot-vscode-plugin/pull/246)
- [Fix the syntax of escaped characters in strings](https://github.com/godotengine/godot-vscode-plugin/pull/247)

### 1.1.1

- Fix bug for GDScript debugger
- Add TCP protocol support for GDScript language server Godot 3.2.2

### 1.1

- Add the debugger to the extension

### 1.0.3

- Fix hover popup position for VSCode 1.42+

### 1.0.1

- Fix run editor error on windows with default terminal configurations

### 1.0.0

- Refactor the whole plugin with gdscript language server support
- Add webview renderer to show documentations of native symbols.
- Only support godot 3.2 and above

### 0.3.7

- Add `lint` configuration to control the behaviors of syntax checking
- Fix error with run godot editor when the editor contains spaces
- Disable semicolons and brackets checks as default can be enabled with project settings
- Fix bugs in syntax valiadating
- Sync documentations with godot 3.0.4
```json
{
    "lint": {
        "semicolon": true,
        "conditionBrackets": true
    }
}
```

### 0.3.6

- Fix project configuration file path

### 0.3.5

- Add option to disable syntax checking for GDScript
- Improved inline if else statement syntax checking
- More resource type supported for syntax highglight
- Bump default godot version to 3.0
- Sync the documentations from godot 3.0

### 0.3.4

- Fix bug with builtin symbols parsing for godot 2.1
- Improved hover documentation
- Show window progress when parsing workspace symbols

### 0.3.3

- Fix some syntax checking errors.
- Fix problems with hover documentation with latest VSCode.
- Improved builtin class documentation page.
- Update the documentation data with latest godot version.

### 0.3.2

- Fix syntax checking error with match statement.
- Improved documentation for builtin code blocks.
- Start using MarkdonwString to keep links valid.

### 0.3.1

- Update documentations with latest godot.
- Fix errors with run script and run project.
- Improve code completion with opening script file and constants.
- Some improvements for documentations.

### 0.3.0

- Add project root configuration settings as `GodotTools.godotProjectRoot` thanks Konstantin Zaitcev
- Add auto indent support for gdscript language
- More friendly with godot 3.0 alpha
- Updated script snippets
- Fix highglight error with gdscript language
- Limited code completions

### 0.2.9

- Add configuration `GodotTools.completeNodePath` to switch is complete node paths
- Enhanced syntax highlight with GDScript
- Enhanced code completion with GDScript

### 0.2.8

- Add godot 3.0 project support with configuration `GodotTools.parseTextScene` >= 3
- Add configuration `GodotTools.parseTextScene` to allow disable node path parsing
- Remove `GodotTools.editorServerPort` configuration

### 0.2.7

- Fix some error with syntax checking
- Add symbol support for enumerations
- Remove key bindings for `F5`~`F8` as it might be conflict with other functionalities of VSCode
    - You can bind the key bindings back by add following configurations
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

- Add shorthand if else expression support
- Add `enum` and `match` expression support
- Fix bugs with syntax checking
- Updated documentation data with godot 2.1.3
- Add syntax checking for end of expression
- The pulugin is compiled with latest VSCode thanks @arrkiin
- Add key bindings for open workspace with godot editor with `F7` and update workspace symbols with `F8`

### 0.2.5

- Run games within VSCode terminals
- Add key bindings for `F5 to run the workspace` and `F6 to run the edting scene`
- Fix a lot of bugs with unused variable checking
- Move workspace symbols state notice to status bar

### 0.2.4

- Add code checking for asignments and comparisons
- Improved builtin documentation preview page
- Fix bugs with unused variable checking

### 0.2.3

- Fix known errors with code syntax checking
- Add configuration `ignoreIndentedVars` to allow ignore indented variables in scripts
- Enhanced hover tip documentation rendering with code examples
- Add launch configurations to launch game with F5(expiremental)

### 0.2.2

- Better Syntax validating for code blocks
- More warning for non-python liked expression

### 0.2.1

- Support markdown render in hover tips for documentations in workspace symbols
- Add configuration `GodotTools.workspaceDocumentWithMarkdown` to control workspace documentation rendering

### 0.2.0

- Show autoloads information in hover tips and go to autoloads' definitions are supported now
- Fix the bug that workspace symbols resoved twice on Windows

### 0.1.9

- Show workspace constant value in hover tips and completion items
- More readable style for links in documentation preview page
- Improve code completion sort order and auto insert `()` for functions without parameters
- Fix bugs with workspace documentation parsing

### 0.1.8

- Show signatures on completion label
- More reliable unused variable and constant checking in documente
- Show workspace documentations and function signatures in completions

### 0.1.7

- Show documentations parsed from GDScripts in hover tips

### 0.1.6

- Reorder mouse hover tips, builtin methods are at top of workspace methods
- Show callabel signatures with documente symbols and workspace symbols
- Syntax highlight support for signal parameters

### 0.1.5

- Add function signature hint support
- Better syntax grammar checking
- Better hover hint message for workspace methods and signals

### 0.1.4

- Add documentation support for builtin Symbols.
- Improve speed of syntax parsing and other actions

### 0.1.3

- Better syntax highlight for GDScript
- Add mouse hover information support
- Add definition provider for GDScript

### 0.1.2

- Multiline string and `StringName` highlight support
- Builtin classes, properties, functions and constants highlight support
- Fix errors in code snipt

### 0.1.1

- Better syntax highlight with GDScript

### 0.1.0

- Initial release

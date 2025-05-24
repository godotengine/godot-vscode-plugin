# Property Inspector (Preact Implementation)

The property inspector has been modernized to use **Preact** for better maintainability, performance, and developer experience.

## Architecture

### Directory Structure
```
property_inspector/
├── webview/                    # Preact webview application
│   ├── src/
│   │   ├── components/         # Preact components
│   │   │   ├── App.tsx        # Main app component
│   │   │   ├── PropertySection.tsx
│   │   │   ├── PropertyRow.tsx
│   │   │   └── PropertyEditors.tsx
│   │   ├── styles/
│   │   │   └── main.css       # All styles
│   │   ├── index.tsx          # Entry point
│   │   ├── index.html         # HTML template
│   │   ├── types.ts           # TypeScript types
│   │   └── utils.ts           # Utility functions
│   ├── dist/                  # Built webview bundle (gitignored)
│   ├── esbuild.config.js      # Build configuration
│   └── tsconfig.json          # TypeScript config
├── webview_provider.ts        # VSCode webview provider
├── property_inspector.ts      # Main property inspection logic
├── types.ts                   # Shared types
└── utils.ts                   # Shared utilities and scene file formatting
```

**Note**: Scene file modification functionality has been consolidated into the main `SceneParser` class (`../parser.ts`) and `SceneNode` class (`../types.ts`) for better architecture and to avoid duplication.

### Key Benefits of Preact

1. **Component-Based Architecture**: Each property editor is a reusable component
2. **Type Safety**: Full TypeScript support with proper typing
3. **Small Bundle Size**: Preact is only ~3KB, perfect for VSCode webviews
4. **Virtual DOM**: Efficient updates when properties change
5. **Modern Development**: JSX, hooks, and modern JavaScript features

### Building the Webview

```bash
# Build once
npm run build-webview

# Watch mode for development
npm run watch-webview

# Production build
npm run build-webview -- --production
```

### How It Works

1. **Extension Side** (`webview_provider.ts`):
   - Creates the webview with proper CSP settings
   - Loads the bundled Preact app
   - Sends property data via `postMessage`
   - Handles messages from the webview

2. **Webview Side** (Preact app):
   - Receives property data and renders UI
   - Handles user interactions (editing, resetting)
   - Sends changes back to extension via `vscode.postMessage`

### Component Overview

- **App.tsx**: Main container, manages overall layout
- **PropertySection.tsx**: Collapsible sections for each class
- **PropertyRow.tsx**: Individual property with editor selection
- **PropertyEditors.tsx**: Specific editors (string, number, boolean, etc.)

### Adding New Property Editors

To add support for new property types (e.g., Vector2, Color):

1. Add the editor component in `PropertyEditors.tsx`
2. Update `getPropertyEditorInfo()` in `utils.ts`
3. Add the case in `PropertyRow.tsx`'s `renderEditor()`

### Message Protocol

**Extension → Webview:**
```typescript
{
  type: 'updateProperties',
  nodeName: string,
  propertiesByClass: { [className: string]: PropertyData[] },
  documentedClasses: string[]
}
```

**Webview → Extension:**
```typescript
{
  type: 'propertyChange',
  propertyName: string,
  newValue: string,
  propertyType: string
}
```

## Development Tips

1. Run `npm run watch-webview` in a separate terminal for hot reload
2. Use Chrome DevTools to debug the webview (Help → Toggle Developer Tools)
3. Check the Output panel for extension logs
4. The webview maintains its own state, synced via messages 
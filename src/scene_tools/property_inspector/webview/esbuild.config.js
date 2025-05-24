const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const webviewPath = path.join(__dirname);

async function build() {
  const context = await esbuild.context({
    entryPoints: [path.join(webviewPath, 'src/index.tsx')],
    bundle: true,
    outfile: path.join(webviewPath, 'dist/webview.js'),
    platform: 'browser',
    format: 'iife',
    minify: production,
    sourcemap: !production,
    loader: {
      '.css': 'css',
    },
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"'
    },
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  });

  if (watch) {
    await context.watch();
    console.log('[webview] Watching for changes...');
  } else {
    await context.rebuild();
    await context.dispose();
  }
}

build().catch(() => process.exit(1)); 
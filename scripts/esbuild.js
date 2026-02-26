const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const outFile = 'out/extension.js';
const outDir = path.dirname(outFile);

async function main() {
  // Keep copied runtime assets (for example out/i18n/*.json) in watch mode.
  // The watch task runs `copy-i18n` before this script, so deleting out/
  // here would remove those files and cause runtime lookup failures.
  if (!watch) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  const context = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: outFile,
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    sourcesContent: false,
    logLevel: 'info'
  });

  if (watch) {
    await context.watch();
    console.log('esbuild watch started');
    return;
  }

  await context.rebuild();
  await context.dispose();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

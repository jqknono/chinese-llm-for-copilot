#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const token = process.env.VSCE_PAT;
if (!token || token.trim().length === 0) {
  console.error('VSCE_PAT is required. Please set VSCE_PAT in your environment before publishing.');
  process.exit(1);
}

const changelogScript = path.resolve(__dirname, 'update-changelog.js');
const changelogResult = spawnSync(process.execPath, [changelogScript], {
  stdio: 'inherit'
});

if (changelogResult.error) {
  console.error(changelogResult.error.message);
  process.exit(1);
}

if ((changelogResult.status ?? 1) !== 0) {
  process.exit(changelogResult.status ?? 1);
}

const passthroughArgs = process.argv.slice(2);
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error('npm_execpath is missing. Run this script via `npm run publish:marketplace`.');
  process.exit(1);
}

const args = [
  npmExecPath,
  'exec',
  '--yes',
  '--',
  '@vscode/vsce',
  'publish',
  '-p',
  token.trim(),
  ...passthroughArgs
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

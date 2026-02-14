#!/usr/bin/env node

const { spawnSync } = require('child_process');

const token = process.env.VSCE_PAT;
if (!token || token.trim().length === 0) {
  console.error('VSCE_PAT is required. Please set VSCE_PAT in your environment before publishing.');
  process.exit(1);
}

const passthroughArgs = process.argv.slice(2);
const args = ['@vscode/vsce', 'publish', '-p', token.trim(), ...passthroughArgs];

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

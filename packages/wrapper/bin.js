#!/usr/bin/env node
const { spawn } = require('node:child_process');

let entry;
try {
  // Prefer the package's default export which should point to the CLI entry
  entry = require.resolve('@theredguild/devcontainer-wizard');
} catch (e) {
  // Detect a common failure mode: older core package missing subpath exports
  const hint = [
    'Failed to resolve @theredguild/devcontainer-wizard.',
    'If you installed devcontainer-wizard before this fix, update to the latest:',
    '  pnpm add -g devcontainer-wizard@latest  # or npm/yarn equivalent',
  ].join('\n');
  console.error(hint + `\nOriginal error: ${e && e.message}`);
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code));
child.on('error', (e) => { console.error('Failed to spawn CLI:', e.message); process.exit(1); });

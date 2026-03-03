#!/usr/bin/env node
require('@swc-node/register');

// Load your CLI
const program = require('../src/index.ts');

// If you want to force exit code 0 no matter what:
program.exitOverride((err) => {
  if (err.code !== 'commander.executeSubCommandAsync') {
    console.error('Commander error:', err.message);
  }
  process.exit(0); // overwrite exit code
});

#!/usr/bin/env node

'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const SERVICES = [
  { name: 'invoke-admin',       dir: 'invoke-admin' },
  { name: 'invoke-execution',   dir: 'invoke-execution' },
  { name: 'invoke-gateway',     dir: 'invoke-gateway' },
  { name: 'invoke-scheduler',   dir: 'invoke-scheduler' },
  { name: 'invoke-cli',         dir: 'invoke-cli' },
];

// Variables that appear in multiple services but should be asked per-service
// because each service intentionally has a different value.
const SHARED_EXCEPTIONS = new Set([
  'PORT',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEnvExample(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).map((raw) => {
    if (raw.trim() === '') return { type: 'blank', raw };
    if (raw.trimStart().startsWith('#')) return { type: 'comment', raw };
    const idx = raw.indexOf('=');
    if (idx === -1) return { type: 'comment', raw }; // malformed — treat as comment
    const key = raw.slice(0, idx).trim();
    const afterEq = raw.slice(idx + 1);
    // Split off inline comment (` #` or `\t#` not inside a quoted value)
    const inlineMatch = afterEq.match(/^([^#]*?)(\s+#.*)$/);
    const defaultValue = (inlineMatch ? inlineMatch[1] : afterEq).trim();
    const inlineComment = inlineMatch ? inlineMatch[2] : '';
    return { type: 'var', raw, key, defaultValue, inlineComment };
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question, defaultValue, inlineComment = '') {
  const hint = defaultValue !== '' ? ` [${defaultValue}]` : '';
  const comment = inlineComment ? `\x1b[2m${inlineComment}\x1b[0m` : '';
  return new Promise((resolve) => {
    rl.question(`  ${question}${hint}${comment}: `, (answer) => {
      resolve(answer.trim() !== '' ? answer.trim() : defaultValue);
    });
  });
}

function header(title) {
  console.log(`\n\x1b[36m── ${title} ──\x1b[0m`);
}

function success(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg)    { console.log(`\x1b[33m⚠\x1b[0m  ${msg}`); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n\x1b[1mInvoke — .env Setup\x1b[0m');
  console.log('Press Enter to accept the default value shown in [brackets].\n');

  // 1. Load all .env.example files
  const parsed = {};
  const available = [];

  for (const svc of SERVICES) {
    const examplePath = path.join(ROOT, svc.dir, '.env.example');
    if (!fs.existsSync(examplePath)) continue;
    parsed[svc.name] = parseEnvExample(examplePath);
    available.push(svc);
  }

  if (available.length === 0) {
    console.error('No .env.example files found. Exiting.');
    process.exit(1);
  }

  // 2. Detect shared variables dynamically
  //    key -> { services: Set, firstDefault: string, firstOrder: number }
  const keyMeta = new Map();
  let globalOrder = 0;

  for (const svc of available) {
    for (const entry of parsed[svc.name]) {
      if (entry.type !== 'var') continue;
      if (!keyMeta.has(entry.key)) {
        keyMeta.set(entry.key, {
          services: new Set(),
          firstDefault: entry.defaultValue,
          firstInlineComment: entry.inlineComment,
          firstOrder: globalOrder++,
        });
      }
      keyMeta.get(entry.key).services.add(svc.name);
    }
  }

  // Shared = appears in 2+ services, unless explicitly excepted
  const sharedKeys = new Set(
    [...keyMeta.entries()]
      .filter(([key, meta]) => meta.services.size >= 2 && !SHARED_EXCEPTIONS.has(key))
      .map(([key]) => key)
  );

  // Sort shared keys by first-seen order
  const sharedKeysOrdered = [...sharedKeys].sort(
    (a, b) => keyMeta.get(a).firstOrder - keyMeta.get(b).firstOrder
  );

  // 3. Overwrite check
  const existing = available
    .map((svc) => path.join(ROOT, svc.dir, '.env'))
    .filter((p) => fs.existsSync(p));

  if (existing.length > 0) {
    warn('The following .env files already exist:');
    existing.forEach((p) => console.log(`    ${path.relative(ROOT, p)}`));
    const answer = await prompt('Overwrite all existing .env files? [Y/n]', 'Y');
    if (!['y', 'yes', ''].includes(answer.toLowerCase())) {
      console.log('\nAborted — no files were changed.');
      rl.close();
      process.exit(0);
    }
  }

  // 4. Collect answers
  const answers = {}; // key -> value

  // 4a. Shared variables (asked once)
  header('Shared Variables (applied to all relevant services)');
  for (const key of sharedKeysOrdered) {
    const meta = keyMeta.get(key);
    answers[key] = await prompt(key, meta.firstDefault, meta.firstInlineComment);
  }

  // 4b. Service-specific variables
  for (const svc of available) {
    const uniqueEntries = parsed[svc.name].filter(
      (e) => e.type === 'var' && !sharedKeys.has(e.key)
    );

    if (uniqueEntries.length === 0) continue;

    const label = svc.name === 'root' ? '. (root)' : svc.name;
    header(`${label} — service-specific variables`);

    for (const entry of uniqueEntries) {
      answers[entry.key] = await prompt(entry.key, entry.defaultValue, entry.inlineComment);
    }
  }

  // 5. Write .env files
  console.log('');
  const written = [];

  for (const svc of available) {
    const lines = parsed[svc.name].map((entry) => {
      if (entry.type !== 'var') return entry.raw;
      const value = answers[entry.key] ?? entry.defaultValue;
      return `${entry.key}=${value}${entry.inlineComment}`;
    });

    const dest = path.join(ROOT, svc.dir, '.env');
    fs.writeFileSync(dest, lines.join('\n') + '\n', 'utf8');
    written.push(path.relative(ROOT, dest).replace(/\\/g, '/'));
  }

  // 6. Summary
  console.log('\x1b[1mCreated:\x1b[0m');
  written.forEach((p) => success(p));
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});

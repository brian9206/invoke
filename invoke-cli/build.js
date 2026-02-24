'use strict';

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(s, d);
        else fs.copyFileSync(s, d);
    }
}

// Native addons and modules that cannot be bundled — they must be installed
// as runtime dependencies alongside the published package.
const EXTERNAL = [
    // Native addons
    'isolated-vm',
    'sandbox-fs',
    'bcrypt',
    // Optional pg native binding (errors if bundled on unsupported platforms)
    'pg-native',
    // Node built-ins — mark both bare and node: prefixed forms
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
    'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
    'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
    'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
    'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
    'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder',
    'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url',
    'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
];

// Also add all node: prefixed variants
const externalWithNodePrefix = [
    ...EXTERNAL,
    ...EXTERNAL.map((m) => `node:${m}`),
];

esbuild.build({
    entryPoints: [path.join(__dirname, 'index.js')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    outfile: path.join(__dirname, 'dist', 'cli.js'),
    external: externalWithNodePrefix,
    // Silence "Can't resolve" warnings for optional peer deps inside packages
    logLevel: 'warning',
}).then(() => {
    // Copy vm-modules and vm-bootstrap from invoke-execution so that
    // __dirname-relative lookups in IsolatePool resolve correctly at runtime.
    const executionServices = path.join(__dirname, '..', 'invoke-execution', 'services');
    const distDir = path.join(__dirname, 'dist');
    copyDirSync(path.join(executionServices, 'vm-modules'), path.join(distDir, 'vm-modules'));
    copyDirSync(path.join(executionServices, 'vm-bootstrap'), path.join(distDir, 'vm-bootstrap'));
    console.log('Build complete → dist/cli.js (+ vm-modules, vm-bootstrap)');
}).catch((err) => {
    console.error('Build failed:', err.message);
    process.exit(1);
});

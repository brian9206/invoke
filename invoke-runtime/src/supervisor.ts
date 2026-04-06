// ============================================================================
// Supervisor — Long-lived process inside the Docker container.
// Connects to /run/events.sock, waits for `execute` events from the host,
// mounts overlayfs per invocation, forks a jailed worker, and cleans up.
// ============================================================================

import net from 'net';
import { fork, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { EventDecoder, encode, type ParsedEvent } from './protocol';

const execFileAsync = promisify(execFile);

const SOCKET_PATH = process.env.INVOKE_SOCKET_PATH || '/run/events.sock';
const WORKER_SCRIPT = path.join(__dirname, 'worker.js');
const INV_BASE = '/opt/inv';
const WORKER_UID = 65534; // nobody
const WORKER_GID = 65534; // nogroup
const TMPFS_SIZE_MB = parseInt(process.env.SANDBOX_TMPFS_MB || '64', 10);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Ensure invocation base dir exists
  fs.mkdirSync(INV_BASE, { recursive: true });

  connectToHost();
}

// ---------------------------------------------------------------------------
// Host connection
// ---------------------------------------------------------------------------

function connectToHost(): void {
  const socket = net.createConnection(SOCKET_PATH, () => {
    console.log('[supervisor] Connected to host IPC');
    socket.write(encode('ready'));
  });

  const decoder = new EventDecoder();

  socket.on('data', (chunk: Buffer) => {
    const events = decoder.feed(chunk);
    for (const ev of events) {
      handleHostEvent(socket, ev);
    }
  });

  socket.on('error', (err) => {
    console.error('[supervisor] Socket error:', err.message);
    process.exit(1);
  });

  socket.on('close', () => {
    console.log('[supervisor] Host socket closed, exiting');
    process.exit(0);
  });

  // Graceful shutdown
  const shutdown = () => {
    socket.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

function handleHostEvent(socket: net.Socket, ev: ParsedEvent): void {
  if (ev.event === 'execute') {
    handleExecute(socket, ev.payload).catch((err) => {
      console.error('[supervisor] Execute error:', err);
      socket.write(encode('error', { error: err.message }));
      // Signal ready again so the container can be reused
      socket.write(encode('ready'));
    });
  }
}

// ---------------------------------------------------------------------------
// Execute handler
// ---------------------------------------------------------------------------

async function handleExecute(
  socket: net.Socket,
  payload: {
    functionId: string;
    invocationId: string;
    request: any;
    env: Record<string, string>;
    codePath: string;
  },
): Promise<void> {
  const { functionId, invocationId, codePath, request, env } = payload;
  const invDir = path.join(INV_BASE, invocationId);

  try {
    // 1. Set up overlay filesystem
    await setupOverlay(invDir, path.dirname(codePath));

    // 2. Fork worker
    const mergedDir = path.join(invDir, 'merged');
    const worker = fork(WORKER_SCRIPT, [
      '--jail', mergedDir,
      '--uid', String(WORKER_UID),
      '--gid', String(WORKER_GID),
      '--socket', SOCKET_PATH,
      '--entry', path.basename(codePath),
    ], {
      env: {}, // Empty env — payload delivered via IPC
      stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
    });

    // 3. Wait for worker to request the payload, then send it via IPC
    await new Promise<void>((resolve, reject) => {
      let exited = false;

      worker.on('message', (msg: any) => {
        if (msg?.type === 'ready_for_payload') {
          worker.send({
            type: 'payload',
            request,
            env,
          });
        }
      });

      worker.on('exit', (code) => {
        exited = true;
        if (code !== 0 && code !== null) {
          reject(new Error(`Worker exited with code ${code}`));
        } else {
          resolve();
        }
      });

      worker.on('error', (err) => {
        if (!exited) reject(err);
      });
    });
  } finally {
    // 4. Clean up overlay filesystem
    await cleanupOverlay(invDir).catch((err) => {
      console.error(`[supervisor] Overlay cleanup failed for ${invocationId}:`, err.message);
    });

    // 5. Signal ready for next invocation
    socket.write(encode('ready'));
  }
}

// ---------------------------------------------------------------------------
// Overlay FS helpers
// ---------------------------------------------------------------------------

async function setupOverlay(invDir: string, lowerDir: string): Promise<void> {
  const rwDir = path.join(invDir, 'rw');
  const upperDir = path.join(rwDir, 'upper');
  const workDir = path.join(rwDir, 'work');
  const mergedDir = path.join(invDir, 'merged');

  // Create directories
  fs.mkdirSync(rwDir, { recursive: true });
  fs.mkdirSync(upperDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(mergedDir, { recursive: true });

  // Mount tmpfs for the writable layer
  await execFileAsync('mount', [
    '-t', 'tmpfs',
    '-o', `size=${TMPFS_SIZE_MB}m,nosuid,noexec`,
    'tmpfs', rwDir,
  ]);

  // Re-create subdirs on the tmpfs
  fs.mkdirSync(upperDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  // Mount overlay
  await execFileAsync('mount', [
    '-t', 'overlay', 'overlay',
    '-o', `lowerdir=${lowerDir},upperdir=${upperDir},workdir=${workDir}`,
    mergedDir,
  ]);
}

async function cleanupOverlay(invDir: string): Promise<void> {
  const mergedDir = path.join(invDir, 'merged');
  const rwDir = path.join(invDir, 'rw');

  // Unmount overlay first, then tmpfs
  try {
    await execFileAsync('umount', ['-l', mergedDir]);
  } catch {
    // Best effort
  }

  try {
    await execFileAsync('umount', ['-l', rwDir]);
  } catch {
    // Best effort
  }

  // Remove invocation directory
  try {
    fs.rmSync(invDir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

main();

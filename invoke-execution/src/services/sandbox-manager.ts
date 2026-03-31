// ============================================================================
// SandboxManager — Manages individual gVisor sandbox containers
// Wraps `runsc` commands for create, checkpoint, restore, destroy
// ============================================================================

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import path from 'path';
import fs from 'fs/promises';
import {
  MessageDecoder,
  encode,
  type HostMessage,
  type ShimMessage,
  type ReadyMessage,
} from 'invoke-runtime/dist/protocol';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SandboxState = 'creating' | 'ready' | 'executing' | 'checkpointing' | 'restoring' | 'destroyed';

export interface SandboxConfig {
  sandboxId: string;
  memoryLimitMb: number;
  runtimeImage: string;
  mergedDir: string;       // OverlayFS merged mount point → /app inside container
  socketDir: string;       // Host-side dir containing invoke.sock
  tapFd?: number;          // TAP device fd for network
}

export interface Sandbox {
  id: string;
  state: SandboxState;
  config: SandboxConfig;
  socket: net.Socket | null;
  decoder: MessageDecoder;
  createdAt: number;
  /** Callback map for messages awaiting a response from the shim */
  pending: Map<string, (msg: ShimMessage) => void>;
}

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

const TIMEOUT_CREATE_MS   = parseInt(process.env.SANDBOX_CREATE_TIMEOUT_MS ?? '30000', 10);
const TIMEOUT_CHECKPOINT_MS = parseInt(process.env.SANDBOX_CHECKPOINT_TIMEOUT_MS ?? '10000', 10);
const TIMEOUT_RESTORE_MS  = parseInt(process.env.SANDBOX_RESTORE_TIMEOUT_MS ?? '5000', 10);
const TIMEOUT_READY_MS    = parseInt(process.env.SANDBOX_READY_TIMEOUT_MS ?? '10000', 10);

const RUNSC_BIN = process.env.RUNSC_BIN || 'runsc';
const SANDBOX_ROOT = process.env.SANDBOX_ROOT || '/var/run/invoke-sandboxes';

// ---------------------------------------------------------------------------
// SandboxManager
// ---------------------------------------------------------------------------

class SandboxManager {

  // -------------------------------------------------------------------------
  // Create a fresh sandbox using `runsc run`
  // -------------------------------------------------------------------------

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const sandbox: Sandbox = {
      id: config.sandboxId,
      state: 'creating',
      config,
      socket: null,
      decoder: new MessageDecoder(),
      createdAt: Date.now(),
      pending: new Map(),
    };

    const bundleDir = path.join(SANDBOX_ROOT, config.sandboxId, 'bundle');
    const rootfsDir = path.join(bundleDir, 'rootfs');
    const socketPath = path.join(config.socketDir, 'invoke.sock');

    // Prepare OCI bundle directory
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.mkdir(rootfsDir, { recursive: true });

    // Write OCI runtime spec
    const ociSpec = this.buildOciSpec(config, socketPath);
    await fs.writeFile(path.join(bundleDir, 'config.json'), JSON.stringify(ociSpec, null, 2));

    // Start sandbox via runsc
    const runArgs = [
      '--root', SANDBOX_ROOT,
      '--network=sandbox',
      'run',
      '-bundle', bundleDir,
      '-detach',
      config.sandboxId,
    ];

    await this.execRunsc(runArgs, TIMEOUT_CREATE_MS);

    // Wait for shim to signal ready on the Unix socket
    sandbox.socket = await this.connectToSocket(socketPath, TIMEOUT_READY_MS);
    await this.waitForReady(sandbox);

    sandbox.state = 'ready';
    return sandbox;
  }

  // -------------------------------------------------------------------------
  // Checkpoint
  // -------------------------------------------------------------------------

  async checkpointSandbox(sandbox: Sandbox, checkpointPath: string): Promise<void> {
    sandbox.state = 'checkpointing';

    await fs.mkdir(checkpointPath, { recursive: true });

    const args = [
      '--root', SANDBOX_ROOT,
      'checkpoint',
      '--image-path', checkpointPath,
      sandbox.id,
    ];

    await this.execRunsc(args, TIMEOUT_CHECKPOINT_MS);
  }

  // -------------------------------------------------------------------------
  // Restore from checkpoint
  // -------------------------------------------------------------------------

  async restoreSandbox(sandboxId: string, checkpointPath: string, config: SandboxConfig): Promise<Sandbox> {
    const sandbox: Sandbox = {
      id: sandboxId,
      state: 'restoring',
      config,
      socket: null,
      decoder: new MessageDecoder(),
      createdAt: Date.now(),
      pending: new Map(),
    };

    const bundleDir = path.join(SANDBOX_ROOT, sandboxId, 'bundle');
    const socketPath = path.join(config.socketDir, 'invoke.sock');

    await fs.mkdir(bundleDir, { recursive: true });

    const ociSpec = this.buildOciSpec(config, socketPath);
    await fs.writeFile(path.join(bundleDir, 'config.json'), JSON.stringify(ociSpec, null, 2));

    const args = [
      '--root', SANDBOX_ROOT,
      '--network=sandbox',
      'restore',
      '-bundle', bundleDir,
      '-image-path', checkpointPath,
      '-detach',
      sandboxId,
    ];

    await this.execRunsc(args, TIMEOUT_RESTORE_MS);

    sandbox.socket = await this.connectToSocket(socketPath, TIMEOUT_READY_MS);
    sandbox.state = 'ready';

    return sandbox;
  }

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  async destroySandbox(sandbox: Sandbox): Promise<void> {
    sandbox.state = 'destroyed';

    // Close socket connection
    if (sandbox.socket) {
      sandbox.socket.destroy();
      sandbox.socket = null;
    }

    // Reject any pending callbacks
    for (const [id, cb] of sandbox.pending) {
      cb({ type: 'error', id, error: 'Sandbox destroyed' } as any);
    }
    sandbox.pending.clear();

    // Kill and delete the container — best-effort
    try {
      await this.execRunsc(['--root', SANDBOX_ROOT, 'kill', sandbox.id, 'KILL'], 5000);
    } catch {
      // Already dead
    }

    try {
      await this.execRunsc(['--root', SANDBOX_ROOT, 'delete', sandbox.id], 5000);
    } catch {
      // Already deleted
    }

    // Cleanup bundle dir
    const bundleDir = path.join(SANDBOX_ROOT, sandbox.id);
    try {
      await fs.rm(bundleDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }

  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------

  /**
   * Send a message to the shim and return immediately (fire-and-forget).
   */
  sendMessage(sandbox: Sandbox, msg: HostMessage): void {
    if (!sandbox.socket || sandbox.state === 'destroyed') {
      throw new Error(`Cannot send to sandbox ${sandbox.id} in state ${sandbox.state}`);
    }
    sandbox.socket.write(encode(msg));
  }

  /**
   * Send a message and wait for a response with a matching `id`.
   */
  sendAndWait<T extends ShimMessage>(sandbox: Sandbox, msg: HostMessage, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = (msg as any).id as string;
      const timer = setTimeout(() => {
        sandbox.pending.delete(id);
        reject(new Error(`Timeout waiting for response to message ${id}`));
      }, timeoutMs);

      sandbox.pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply as T);
      });

      this.sendMessage(sandbox, msg);
    });
  }

  /**
   * Set up the data listener on a sandbox socket so incoming messages
   * are decoded and routed to pending callbacks or a fallback handler.
   */
  setupMessageRouting(sandbox: Sandbox, fallback: (msg: ShimMessage) => void): void {
    if (!sandbox.socket) return;

    sandbox.socket.on('data', (data: Buffer) => {
      const messages = sandbox.decoder.feed(data.toString('utf8'));
      for (const msg of messages) {
        const shimMsg = msg as ShimMessage;
        const id = (shimMsg as any).id as string | undefined;

        if (id && sandbox.pending.has(id)) {
          const cb = sandbox.pending.get(id)!;
          sandbox.pending.delete(id);
          cb(shimMsg);
        } else {
          fallback(shimMsg);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // OCI Spec
  // -------------------------------------------------------------------------

  private buildOciSpec(config: SandboxConfig, socketPath: string): Record<string, unknown> {
    return {
      ociVersion: '1.0.2',
      process: {
        terminal: false,
        user: { uid: 1000, gid: 1000 },
        args: ['node', '/opt/shim/dist/index.js'],
        env: [
          'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          'NODE_ENV=production',
          `INVOKE_SOCKET_PATH=/run/invoke.sock`,
        ],
        cwd: '/app',
        capabilities: {
          bounding: [],
          effective: [],
          inheritable: [],
          permitted: [],
          ambient: [],
        },
        noNewPrivileges: true,
      },
      root: {
        path: 'rootfs',
        readonly: false,
      },
      mounts: [
        { destination: '/proc', type: 'proc', source: 'proc' },
        { destination: '/dev', type: 'tmpfs', source: 'tmpfs', options: ['nosuid', 'strictatime', 'mode=755', 'size=65536k'] },
        { destination: '/tmp', type: 'tmpfs', source: 'tmpfs', options: ['nosuid', 'noexec', 'size=67108864'] },
        {
          destination: '/app',
          type: 'bind',
          source: config.mergedDir,
          options: ['rbind', 'ro'],
        },
        {
          destination: '/run/invoke.sock',
          type: 'bind',
          source: socketPath,
          options: ['bind'],
        },
      ],
      linux: {
        namespaces: [
          { type: 'pid' },
          { type: 'ipc' },
          { type: 'uts' },
          { type: 'mount' },
          { type: 'network' },
        ],
        resources: {
          memory: {
            limit: config.memoryLimitMb * 1024 * 1024,
          },
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async execRunsc(args: string[], timeoutMs: number): Promise<string> {
    const { stdout } = await execFile(RUNSC_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  }

  private connectToSocket(socketPath: string, timeoutMs: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;

      const tryConnect = () => {
        if (Date.now() > deadline) {
          return reject(new Error(`Timeout connecting to sandbox socket at ${socketPath}`));
        }

        const socket = net.createConnection(socketPath);

        socket.once('connect', () => {
          socket.removeAllListeners('error');
          resolve(socket);
        });

        socket.once('error', () => {
          socket.destroy();
          // Socket file may not exist yet — retry after a short delay
          setTimeout(tryConnect, 50);
        });
      };

      tryConnect();
    });
  }

  private waitForReady(sandbox: Sandbox): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Sandbox ${sandbox.id} did not send ready signal within ${TIMEOUT_READY_MS}ms`));
      }, TIMEOUT_READY_MS);

      const onData = (data: Buffer) => {
        const messages = sandbox.decoder.feed(data.toString('utf8'));
        for (const msg of messages) {
          if ((msg as ReadyMessage).type === 'ready') {
            clearTimeout(timer);
            sandbox.socket!.removeListener('data', onData);
            resolve();
            return;
          }
        }
      };

      sandbox.socket!.on('data', onData);
    });
  }
}

export default new SandboxManager();

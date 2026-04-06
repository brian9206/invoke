// ============================================================================
// Sandbox Module — SandboxOrchestrator + Sandbox
// Docker-based container lifecycle with IPC
// ============================================================================

import { EventEmitter } from 'events';
import net from 'net';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { Writable, PassThrough } from 'stream';
import Dockerode from 'dockerode';

const execFileAsync = promisify(execFile);

const ALLOWED_IPTABLES_ACTIONS = new Set(['DROP', 'RETURN', 'ACCEPT', 'REJECT']);
const VALID_NETWORK_NAME = /^[a-zA-Z0-9-]+$/;
const VALID_CIDR = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

let iptablesBinCache: string | null = null;
let iptablesRestoreBinCache: string | null = null;

async function resolveBinary(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync('which', [candidate]);
      const resolved = stdout.trim();
      if (resolved) return resolved;
    } catch {
      // Continue to absolute path checks below
    }

    if (candidate.startsWith('/')) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Ignore
      }
    }
  }

  throw new Error(`Unable to find binary. Tried: ${candidates.join(', ')}`);
}

async function getIptablesBin(): Promise<string> {
  if (iptablesBinCache) return iptablesBinCache;
  iptablesBinCache = await resolveBinary([
    'iptables',
    '/usr/sbin/iptables',
    '/sbin/iptables',
    'iptables-legacy',
    '/usr/sbin/iptables-legacy',
    '/sbin/iptables-legacy',
    'iptables-nft',
    '/usr/sbin/iptables-nft',
    '/sbin/iptables-nft',
  ]);
  return iptablesBinCache;
}

async function getIptablesRestoreBin(): Promise<string> {
  if (iptablesRestoreBinCache) return iptablesRestoreBinCache;
  iptablesRestoreBinCache = await resolveBinary([
    'iptables-restore',
    '/usr/sbin/iptables-restore',
    '/sbin/iptables-restore',
    'iptables-legacy-restore',
    '/usr/sbin/iptables-legacy-restore',
    '/sbin/iptables-legacy-restore',
    'iptables-nft-restore',
    '/usr/sbin/iptables-nft-restore',
    '/sbin/iptables-nft-restore',
  ]);
  return iptablesRestoreBinCache;
}

async function execIptables(args: string[]): Promise<void> {
  const iptablesBin = await getIptablesBin();
  await execFileAsync(iptablesBin, args);
}

async function runIptablesRestore(input: string): Promise<void> {
  console.log('[iptables-restore] Applying rules:\n---\n' + input + '\n---');
  const iptablesRestoreBin = await getIptablesRestoreBin();
  return new Promise((resolve, reject) => {
    const proc = spawn(iptablesRestoreBin, ['--noflush']);
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.stdin.write(input, 'utf8');
    proc.stdin.end();
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`iptables-restore failed (exit ${code}): ${stderr.trim()}`));
    });
    proc.on('error', reject);
  });
}

// ============================================================================
// Constants
// ============================================================================

const INTERNAL_EVENTS = new Set([
  'exit', 'stdout', 'stderr', 'error',
  'newListener', 'removeListener', 'close',
]);

// ============================================================================
// Types
// ============================================================================

export interface FilesystemMount {
  host: string;
  target: string;
  flag: string; // e.g. 'ro', 'rw'
}

export interface OrchestratorOptions {
  workdir: string;
  socket: string;          // Docker socket path
  image: string;
  runtime: string;
  filesystem: FilesystemMount[];
  env: Record<string, string>;
  caps: string[];
}

export interface NetworkRule {
  cidr: string;
  action: string;
}

export interface SetNetworkOptions {
  name: string;
  rules: NetworkRule[];
}

interface NetworkState {
  name: string;
  networkId: string;
  bridgeIface: string;
  chainName: string;
}

export interface SpawnOptions {
  network?: string;
  resources: {
    memory: {
      limit: number; // bytes
    };
  };
}

function getChainName(networkName: string): string {
  // iptables chain names must be < 29 chars. Use a deterministic short hash.
  const digest = crypto.createHash('sha1').update(networkName).digest('hex').slice(0, 20);
  return `inv-${digest}`;
}

// ============================================================================
// Sandbox
// ============================================================================

export class Sandbox extends EventEmitter {
  readonly id: string;
  readonly stdin: Writable;

  private _container: Dockerode.Container;
  private _ipcServer: net.Server;
  private _ipcClients: net.Socket[] = [];
  private _destroyed = false;

  constructor(
    id: string,
    stdin: Writable,
    container: Dockerode.Container,
    ipcServer: net.Server,
  ) {
    super();
    this.id = id;
    this.stdin = stdin;
    this._container = container;
    this._ipcServer = ipcServer;
  }

  /** @internal — called by orchestrator to register an IPC client */
  _addIpcClient(socket: net.Socket): void {
    this._ipcClients.push(socket);
    this._setupIpcReader(socket);

    socket.on('close', () => {
      const idx = this._ipcClients.indexOf(socket);
      if (idx !== -1) this._ipcClients.splice(idx, 1);
    });
    socket.on('error', () => {
      socket.destroy();
    });
  }

  /**
   * Override emit: local listeners always fire.
   * Non-internal events are also broadcast to all IPC clients.
   */
  emit(event: string | symbol, ...args: any[]): boolean {
    const result = super.emit(event, ...args);

    if (typeof event !== 'string' || INTERNAL_EVENTS.has(event) || this._destroyed) {
      return result;
    }

    // Broadcast to IPC clients
    // args layout: (payload?, buffer?)
    const payload = args[0];
    const buffer: Buffer | undefined = args[1] instanceof Buffer ? args[1] : undefined;

    if (buffer) {
      const header = JSON.stringify({
        event,
        payload,
        binary: true,
        size: buffer.length,
      });
      const headerBuf = Buffer.from(header + '\n', 'utf8');
      for (const client of this._ipcClients) {
        if (!client.destroyed) {
          client.write(headerBuf);
          client.write(buffer);
        }
      }
    } else {
      const msg = Buffer.from(JSON.stringify({ event, payload }) + '\n', 'utf8');
      for (const client of this._ipcClients) {
        if (!client.destroyed) {
          client.write(msg);
        }
      }
    }

    return result;
  }

  /**
   * Tear down everything: stop container, close IPC
   */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    // Stop container (ignore if already stopped)
    try {
      await this._container.stop({ t: 2 });
    } catch {
      // already stopped
    }

    // Remove container
    try {
      await this._container.remove({ force: true });
    } catch {
      // already removed
    }

    // Close IPC clients
    for (const client of this._ipcClients) {
      client.destroy();
    }
    this._ipcClients = [];

    // Close IPC server
    await new Promise<void>((resolve) => {
      this._ipcServer.close(() => resolve());
    });
  }

  // --------------------------------------------------------------------------
  // IPC reader state machine — binary-aware framing
  // --------------------------------------------------------------------------

  private _setupIpcReader(socket: net.Socket): void {
    let textBuffer = Buffer.alloc(0);
    let binaryHeader: { event: string; payload: any; size: number } | null = null;
    let binaryCollected = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      let data = chunk;

      while (data.length > 0) {
        if (binaryHeader) {
          // BINARY mode: collect exactly `size` bytes
          const remaining = binaryHeader.size - binaryCollected.length;
          const take = Math.min(remaining, data.length);
          binaryCollected = Buffer.concat([binaryCollected, data.subarray(0, take)]);
          data = data.subarray(take);

          if (binaryCollected.length === binaryHeader.size) {
            // Emit locally (super.emit to avoid re-broadcast)
            super.emit(binaryHeader.event, binaryHeader.payload, binaryCollected);
            binaryHeader = null;
            binaryCollected = Buffer.alloc(0);
          }
        } else {
          // TEXT mode: buffer until \n
          const nlIdx = data.indexOf(0x0a); // '\n'
          if (nlIdx === -1) {
            textBuffer = Buffer.concat([textBuffer, data]);
            data = Buffer.alloc(0);
          } else {
            const line = Buffer.concat([textBuffer, data.subarray(0, nlIdx)]);
            textBuffer = Buffer.alloc(0);
            data = data.subarray(nlIdx + 1);

            // Parse JSON
            let parsed: any;
            try {
              parsed = JSON.parse(line.toString('utf8'));
            } catch {
              // Malformed JSON — skip
              continue;
            }

            if (parsed.binary && typeof parsed.size === 'number') {
              binaryHeader = {
                event: parsed.event,
                payload: parsed.payload,
                size: parsed.size,
              };
              binaryCollected = Buffer.alloc(0);
              // Continue loop — remaining data may contain binary bytes
            } else {
              // Text-only event — emit locally
              super.emit(parsed.event, parsed.payload);
            }
          }
        }
      }
    });
  }
}

// ============================================================================
// SandboxOrchestrator
// ============================================================================

export class SandboxOrchestrator {
  private _opts: OrchestratorOptions;
  private _docker: Dockerode;
  private _initialized = false;
  private _networks = new Map<string, NetworkState>();
  private _sandboxes = new Map<string, Sandbox>();
  private _exitHandler: (() => Promise<void>) | null = null;

  constructor(opts: OrchestratorOptions) {
    this._opts = opts;
    this._docker = new Dockerode({ socketPath: opts.socket });
  }

  /**
   * Prepare workdir and verify Docker connectivity.
   */
  async init(): Promise<void> {
    const { workdir } = this._opts;

    // Remove and recreate workdir
    await fs.rm(workdir, { recursive: true, force: true });
    await fs.mkdir(workdir, { recursive: true });

    // Ping docker
    try {
      await this._docker.ping();
    } catch (err) {
      throw new Error(`Docker not reachable at ${this._opts.socket}: ${err}`);
    }

    this._initialized = true;

    // Register graceful shutdown handlers
    const handler = async () => {
      await this.destroy().catch(() => {});
      process.exit(0);
    };
    this._exitHandler = handler;
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }

  /**
   * Spawn a new sandboxed container.
   */
  async spawn(options: SpawnOptions): Promise<Sandbox> {
    if (!this._initialized) {
      throw new Error('SandboxOrchestrator.init() must be called before spawn()');
    }

    const id = 'sb-' + crypto.randomUUID().replaceAll('-', '');
    const { workdir } = this._opts;
    const ipcPath = path.join(workdir, `${id}.sock`);

    // Track created resources for cleanup on failure
    let ipcServer: net.Server | null = null;
    let container: Dockerode.Container | null = null;

    try {
      // 1. Create IPC unix socket server
      ipcServer = net.createServer();
      await new Promise<void>((resolve, reject) => {
        ipcServer!.listen(ipcPath, () => resolve());
        ipcServer!.on('error', reject);
      });

      // 2. Build bind mounts
      const binds: string[] = [];
      for (const m of this._opts.filesystem) {
        binds.push(`${m.host}:${m.target}:${m.flag}`);
      }
      // IPC socket → /run/events.sock
      binds.push(`${ipcPath}:/run/events.sock`);

      // 3. Build env array
      const envArr: string[] = [];
      for (const [k, v] of Object.entries(this._opts.env)) {
        if (k === 'SANDBOX_ID') continue;  // we always overwrite
        envArr.push(`${k}=${v}`);
      }
      envArr.push(`SANDBOX_ID=${id}`);

      // 5. Create container
      container = await this._docker.createContainer({
        Image: this._opts.image,
        Env: envArr,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: true,
        Tty: false,
        HostConfig: {
          Runtime: this._opts.runtime,
          Memory: options.resources.memory.limit,
          NetworkMode: options.network ?? 'none',
          Binds: binds,
          CapAdd: this._opts.caps,
        },
      });

      // 6. Set up wait() before start to avoid missing fast exits
      const waitPromise = container.wait();

      // 7. Attach for stdin/stdout/stderr
      const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      });

      // 8. Start container
      await container.start();

      // 9. Create writable stdin from the attach stream
      const stdinStream = new PassThrough();
      stdinStream.pipe(stream);

      // 10. Demux stdout/stderr
      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();
      this._docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      // 11. Build Sandbox instance
      const sandbox = new Sandbox(id, stdinStream, container, ipcServer);

      // Wire stdout/stderr events (use super.emit via internal emit)
      stdoutStream.on('data', (chunk: Buffer) => {
        EventEmitter.prototype.emit.call(sandbox, 'stdout', chunk);
      });
      stderrStream.on('data', (chunk: Buffer) => {
        EventEmitter.prototype.emit.call(sandbox, 'stderr', chunk);
      });

      // Wire exit event from wait promise
      waitPromise
        .then((result: { StatusCode: number }) => {
          EventEmitter.prototype.emit.call(sandbox, 'exit', result.StatusCode);
        })
        .catch((err: Error) => {
          EventEmitter.prototype.emit.call(sandbox, 'error', err);
        });

      // Wire IPC client connections
      ipcServer.on('connection', (client: net.Socket) => {
        sandbox._addIpcClient(client);
      });

      // Track sandbox for orchestrator-level teardown
      this._sandboxes.set(id, sandbox);
      sandbox.once('exit', () => { this._sandboxes.delete(id); });
      sandbox.once('error', () => { this._sandboxes.delete(id); });

      return sandbox;
    } catch (err) {
      // Cleanup partial resources
      if (container) {
        try { await container.stop({ t: 0 }); } catch {}
        try { await container.remove({ force: true }); } catch {}
      }
      if (ipcServer) {
        ipcServer.close();
        await fs.unlink(ipcPath).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Create (or update rules for) a managed Docker bridge network with iptables filtering.
   * Idempotent: uses `iptables -C` to determine whether the DOCKER-USER jump rule already
   * exists before including a `-D` in the restore table.
   */
  async setNetwork(options: SetNetworkOptions): Promise<string> {
    if (!this._initialized) {
      throw new Error('SandboxOrchestrator.init() must be called before setNetwork()');
    }

    const { name, rules } = options;

    if (!name || !VALID_NETWORK_NAME.test(name)) {
      throw new Error(`Invalid network name: "${name}". Must match /^[a-zA-Z0-9-]+$/`);
    }
    for (const rule of rules) {
      if (!VALID_CIDR.test(rule.cidr)) {
        throw new Error(`Invalid CIDR: "${rule.cidr}"`);
      }
      if (!ALLOWED_IPTABLES_ACTIONS.has(rule.action)) {
        throw new Error(`Invalid action: "${rule.action}". Must be one of: ${[...ALLOWED_IPTABLES_ACTIONS].join(', ')}`);
      }
    }

    // Inspect or create Docker network
    let networkInfo: any;
    try {
      networkInfo = await this._docker.getNetwork(name).inspect();
    } catch {
      await this._docker.createNetwork({ Name: name, Driver: 'bridge' });
      networkInfo = await this._docker.getNetwork(name).inspect();
    }

    const networkId: string = networkInfo.Id;
    const bridgeIface = `br-${networkId.substring(0, 12)}`;
    const chainName = getChainName(name);

    // Pre-check: does the DOCKER-USER jump rule already exist?
    let jumpRuleExists = false;
    try {
      await execIptables(['-C', 'DOCKER-USER', '-i', bridgeIface, '-j', chainName]);
      jumpRuleExists = true;
    } catch {
      jumpRuleExists = false;
    }

    // Build iptables-restore table
    const lines: string[] = [
      '*filter',
      `:${chainName} - [0:0]`,
      `-F ${chainName}`,
      ...rules.map(r => `-A ${chainName} -d ${r.cidr} -j ${r.action}`),
      `-A ${chainName} -j DROP`,
    ];
    if (jumpRuleExists) {
      lines.push(`-D DOCKER-USER -i ${bridgeIface} -j ${chainName}`);
      lines.push(`-D INPUT -i ${bridgeIface} -j ${chainName}`);
    }
    lines.push(`-I DOCKER-USER 1 -i ${bridgeIface} -j ${chainName}`);
    lines.push(`-I INPUT 1 -i ${bridgeIface} -j ${chainName}`);
    lines.push('COMMIT');

    await runIptablesRestore(lines.join('\n') + '\n');

    this._networks.set(name, { name, networkId, bridgeIface, chainName });
    return networkId;
  }

  /**
   * Remove a managed network: clean up iptables chain and Docker network.
   * Uses iptables-restore --noflush with an iptables -C pre-check for idempotency.
   */
  async removeNetwork(name: string): Promise<void> {
    const state = this._networks.get(name);
    if (!state) return;

    const { bridgeIface, chainName } = state;

    // Pre-check: does the DOCKER-USER jump rule exist?
    let jumpRuleExists = false;
    try {
      await execIptables(['-C', 'DOCKER-USER', '-i', bridgeIface, '-j', chainName]);
      jumpRuleExists = true;
    } catch {
      jumpRuleExists = false;
    }

    // Build removal restore table
    const lines: string[] = ['*filter'];
    if (jumpRuleExists) {
      lines.push(`-D DOCKER-USER -i ${bridgeIface} -j ${chainName}`);
      lines.push(`-D INPUT -i ${bridgeIface} -j ${chainName}`);
    }
    lines.push(`-F ${chainName}`);
    lines.push(`-X ${chainName}`);
    lines.push('COMMIT');

    try {
      await runIptablesRestore(lines.join('\n') + '\n');
    } catch {
      // Ignore iptables errors during cleanup
    }

    try {
      await this._docker.getNetwork(name).remove();
    } catch {
      // Ignore if containers still attached or already removed
    }

    this._networks.delete(name);
  }

  /**
   * Graceful shutdown: destroy all running sandboxes, remove all managed networks,
   * and clean the workdir.
   */
  async destroy(): Promise<void> {
    // Unregister signal handlers to prevent re-entrant calls
    if (this._exitHandler) {
      process.off('SIGINT', this._exitHandler);
      process.off('SIGTERM', this._exitHandler);
      this._exitHandler = null;
    }

    if (!this._initialized) return;

    await Promise.allSettled([...this._sandboxes.values()].map(s => s.destroy()));
    this._sandboxes.clear();

    await Promise.allSettled([...this._networks.keys()].map(n => this.removeNetwork(n)));

    await fs.rm(this._opts.workdir, { recursive: true, force: true });
    this._initialized = false;
  }
}

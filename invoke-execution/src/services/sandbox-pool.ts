// ============================================================================
// SandboxPool — Manages a pool of reusable Docker containers via
// SandboxOrchestrator.  Containers persist across invocations.
// ============================================================================

import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import {
  SandboxOrchestrator,
  Sandbox,
  type OrchestratorOptions,
  type SpawnOptions,
  type NetworkRule,
} from './sandbox-orchestrator';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MIN_POOL_SIZE = parseInt(process.env.SANDBOX_MIN_POOL_SIZE || process.env.SANDBOX_POOL_SIZE || '5', 10);
const MAX_POOL_SIZE = parseInt(process.env.SANDBOX_MAX_POOL_SIZE || '20', 10);
const MEMORY_MB = parseInt(process.env.SANDBOX_MEMORY_MB || '256', 10);
const RUNTIME = process.env.SANDBOX_RUNTIME || 'runc';
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const IPC_DIR = process.env.SANDBOX_IPC_DIR || '/tmp/invoke-ipc';
const RUNTIME_IMAGE = process.env.RUNTIME_IMAGE || 'ghcr.io/brian9206/invoke/runtime:latest';
const CGROUPNS_MODE = (process.env.SANDBOX_CGROUPNS_MODE as 'host' | 'private' | undefined) || 'host';
const ACQUIRE_TIMEOUT_MS = 30_000;
const MAINTENANCE_INTERVAL_MS = parseInt(process.env.SANDBOX_MAINTENANCE_INTERVAL_MS || '1800000', 10);

// The host cache directory where extracted function packages live.
// Must match the cacheDir used by cache.ts: path.join(os.tmpdir(), 'cache')
const PACKAGES_DIR = path.join(os.tmpdir(), 'cache', 'packages');

// ---------------------------------------------------------------------------
// Pool metrics
// ---------------------------------------------------------------------------

export interface SandboxPoolMetrics {
  idle: number;
  busy: number;
  total: number;
  minPoolSize: number;
  maxPoolSize: number;
  coldStarts: number;
  totalSpawned: number;
  totalDestroyed: number;
}

// ---------------------------------------------------------------------------
// SandboxPool
// ---------------------------------------------------------------------------

export class SandboxPool extends EventEmitter {
  private orchestrator!: SandboxOrchestrator;
  private idleSet = new Set<Sandbox>();
  private busySet = new Set<Sandbox>();
  private allSandboxes = new Map<string, Sandbox>();
  private waiters: Array<{ resolve: (sb: Sandbox) => void; reject: (err: Error) => void }> = [];
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private initialized = false;

  // Metrics
  private coldStarts = 0;
  private totalSpawned = 0;
  private totalDestroyed = 0;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const opts: OrchestratorOptions = {
      workdir: IPC_DIR,
      socket: DOCKER_SOCKET,
      image: RUNTIME_IMAGE,
      runtime: RUNTIME,
      filesystem: [
        { host: PACKAGES_DIR, target: '/functions', flag: 'ro' },
        { host: '/sys/fs/cgroup', target: '/sys/fs/cgroup', flag: 'rw' },
      ],
      env: {
        INVOKE_SOCKET_PATH: '/run/events.sock',
        NODE_COMPILE_CACHE: '/tmp/nodecache',
      },
      caps: ['CAP_SYS_ADMIN', 'SYS_CHROOT', 'SETUID', 'SETGID', 'SYS_RESOURCE', 'DAC_OVERRIDE'],
      cgroupnsMode: CGROUPNS_MODE,
    };

    this.orchestrator = new SandboxOrchestrator(opts);
    await this.orchestrator.init();

    // Ensure the packages directory exists before spawning containers
    // (bind-mount will fail if the host path does not exist)
    fs.mkdirSync(PACKAGES_DIR, { recursive: true });

    // Pre-spawn MIN_POOL_SIZE containers
    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < MIN_POOL_SIZE; i++) {
      spawnPromises.push(this.spawnAndTrack().catch((err) => {
        console.error(`[SandboxPool] Failed to pre-spawn container ${i + 1}:`, err.message);
      }));
    }
    await Promise.allSettled(spawnPromises);

    // Start maintenance timer
    this.maintenanceTimer = setInterval(() => this.maintenance(), MAINTENANCE_INTERVAL_MS);

    this.initialized = true;
    console.log(`[SandboxPool] Initialized: ${this.idleSet.size}/${MIN_POOL_SIZE} containers ready`);
  }

  /**
   * Acquire an idle container. If none available and under MAX, spawn fresh (cold start).
   * If at MAX, wait up to ACQUIRE_TIMEOUT_MS.
   */
  async acquire(): Promise<Sandbox> {
    if (this.shuttingDown) throw new Error('SandboxPool is shutting down');

    const acquireStart = Date.now();

    // Fast path: grab from idle set
    const idle = this.popIdle();
    if (idle) {
      this.busySet.add(idle);
      const idleTime = Date.now() - acquireStart;
      console.log(`[POOL] acquire (IDLE): ${idleTime}ms`);
      return idle;
    }

    // Cold start: spawn a new container if under MAX
    const total = this.allSandboxes.size;
    if (total < MAX_POOL_SIZE) {
      this.coldStarts++;
      console.log(`[POOL] acquire (COLD START): spawning container ${this.coldStarts}`);
      const spawnStart = Date.now();
      const sandbox = await this.spawnOne();
      const spawnTime = Date.now() - spawnStart;
      
      // Wait for the first 'ready' event from supervisor
      const readyStart = Date.now();
      await this.waitForReady(sandbox);
      const readyTime = Date.now() - readyStart;
      
      this.busySet.add(sandbox);
      const totalColdTime = Date.now() - acquireStart;
      console.log(`[POOL] acquire (COLD START) total=${totalColdTime}ms (spawn=${spawnTime}ms, ready=${readyTime}ms)`);
      return sandbox;
    }

    // At capacity: wait for a container to become idle
    return new Promise<Sandbox>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`SandboxPool: acquire timeout (${ACQUIRE_TIMEOUT_MS}ms) — all ${MAX_POOL_SIZE} containers busy`));
      }, ACQUIRE_TIMEOUT_MS);

      this.waiters.push({
        resolve: (sb: Sandbox) => {
          clearTimeout(timer);
          const waitTime = Date.now() - acquireStart;
          console.log(`[POOL] acquire (WAIT): ${waitTime}ms`);
          resolve(sb);
        },
        reject,
      });
    });
  }

  /**
   * Get pool metrics.
   */
  getMetrics(): SandboxPoolMetrics {
    return {
      idle: this.idleSet.size,
      busy: this.busySet.size,
      total: this.allSandboxes.size,
      minPoolSize: MIN_POOL_SIZE,
      maxPoolSize: MAX_POOL_SIZE,
      coldStarts: this.coldStarts,
      totalSpawned: this.totalSpawned,
      totalDestroyed: this.totalDestroyed,
    };
  }

  /**
   * Apply (or replace) the global iptables chain covering all containers
   * on the default Docker bridge. Omitting `name` targets invoke-sandbox-global.
   */
  async setGlobalNetwork(rules: NetworkRule[]): Promise<void> {
    await this.orchestrator.setNetwork({ rules });
  }

  /**
   * Graceful shutdown: wait for busy containers, then destroy all.
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }

    // Reject all waiters
    for (const w of this.waiters) {
      w.reject(new Error('SandboxPool is shutting down'));
    }
    this.waiters = [];

    // Wait for busy containers to finish (up to 30s)
    if (this.busySet.size > 0) {
      console.log(`[SandboxPool] Waiting for ${this.busySet.size} busy containers...`);
      const deadline = Date.now() + 30_000;
      while (this.busySet.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Destroy orchestrator (which destroys all containers)
    await this.orchestrator.destroy();
    this.idleSet.clear();
    this.busySet.clear();
    this.allSandboxes.clear();
    this.initialized = false;

    console.log('[SandboxPool] Shutdown complete');
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private popIdle(): Sandbox | undefined {
    const iter = this.idleSet.values().next();
    if (iter.done) return undefined;
    const sb = iter.value;
    this.idleSet.delete(sb);
    return sb;
  }

  private async spawnOne(): Promise<Sandbox> {
    const spawnOpts: SpawnOptions = {
      network: 'bridge',
      resources: {
        memory: { limit: MEMORY_MB * 1024 * 1024 },
      },
    };

    const sandbox = await this.orchestrator.spawn(spawnOpts);
    this.allSandboxes.set(sandbox.id, sandbox);
    this.totalSpawned++;

    // Listen for 'ready' events: supervisor reports idle after each invocation
    sandbox.on('ready', () => {
      
      if (this.shuttingDown) return;

      // If this sandbox was removed from the pool (crashed), ignore the ready event
      if (!this.allSandboxes.has(sandbox.id)) return;

      // If it was busy, move to idle
      if (this.busySet.has(sandbox)) {
        this.busySet.delete(sandbox);
      }

      // Check if any waiters need a container
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift()!;
        this.busySet.add(sandbox);
        waiter.resolve(sandbox);
      } else {
        this.idleSet.add(sandbox);
      }

      console.log('idle', this.idleSet.size, 'busy', this.busySet.size, 'waiters', this.waiters.length);
    });

    // Collect container output — surfaces supervisor errors and crash messages
    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];
    sandbox.on('stderr', (chunk: Buffer) => stderrChunks.push(chunk));
    sandbox.on('stdout', (chunk: Buffer) => stdoutChunks.push(chunk));

    const dumpLogs = () => {
      const out = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const err = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (out) console.log(`[SandboxPool] Container ${sandbox.id} stdout:\n${out}`);
      if (err) console.error(`[SandboxPool] Container ${sandbox.id} stderr:\n${err}`);
    };

    const handleCrash = (reason: string) => {
      if (this.shuttingDown) return;
      console.warn(`[SandboxPool] Container ${sandbox.id} crashed or lost connection (${reason})`);
      dumpLogs();
      this.removeSandbox(sandbox);
      sandbox.destroy().catch(() => {});

      // Spawn replacement if below MIN
      const deficit = MIN_POOL_SIZE - this.allSandboxes.size;
      for (let i = 0; i < deficit; i++) {
        this.spawnAndTrack().catch((spawnErr) => {
          console.error('[SandboxPool] Replacement spawn failed:', String(spawnErr));
        });
      }
    };

    // Handle unexpected container exit, error, or IPC disconnect
    sandbox.once('exit', (code: number) => handleCrash(`exit code ${code}`));
    sandbox.once('error', (err: unknown) => handleCrash(`error: ${err}`));
    sandbox.once('ipc_disconnect', () => handleCrash('ipc disconnected'));

    return sandbox;
  }

  /**
   * Spawn a container and wait until it reports ready, then add to idle set.
   */
  private async spawnAndTrack(): Promise<void> {
    const sandbox = await this.spawnOne();
    await this.waitForReady(sandbox);
    // Only add to idle if not already claimed by a waiter in the 'ready' handler
    if (!this.busySet.has(sandbox) && !this.idleSet.has(sandbox)) {
      this.idleSet.add(sandbox);
    }
  }

  private waitForReady(sandbox: Sandbox): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Container ${sandbox.id} did not report ready within 30s`));
      }, 30_000);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onExit = (code: number) => {
        clearTimeout(timeout);
        reject(new Error(`Container ${sandbox.id} exited (code ${code}) before ready`));
      };

      const onError = (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      };

      sandbox.once('ready', onReady);
      sandbox.once('exit', onExit);
      sandbox.once('error', onError);
    });
  }

  private removeSandbox(sandbox: Sandbox): void {
    this.idleSet.delete(sandbox);
    this.busySet.delete(sandbox);
    this.allSandboxes.delete(sandbox.id);
    this.totalDestroyed++;
  }

  /**
   * Periodic maintenance: replenish pool if below MIN, trim excess above MIN.
   */
  private async maintenance(): Promise<void> {
    if (this.shuttingDown) return;

    // Replenish if below MIN
    const deficit = MIN_POOL_SIZE - this.allSandboxes.size;
    if (deficit > 0) {
      for (let i = 0; i < deficit; i++) {
        this.spawnAndTrack().catch((err) => {
          console.error('[SandboxPool] Maintenance spawn failed:', err.message);
        });
      }
    }

    // Trim excess idle containers beyond MIN if total > MIN
    while (this.idleSet.size > 0 && this.allSandboxes.size > MIN_POOL_SIZE) {
      const sb = this.popIdle();
      if (!sb) break;
      this.allSandboxes.delete(sb.id);
      this.totalDestroyed++;
      sb.destroy().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let instance: SandboxPool | null = null;

export function getSandboxPool(): SandboxPool {
  if (!instance) {
    instance = new SandboxPool();
  }
  return instance;
}

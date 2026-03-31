// ============================================================================
// WarmPool — Manages a pool of pre-restored gVisor sandboxes
// Replaces IsolatePool with checkpoint/restore semantics
// ============================================================================

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import sandboxManager, { type Sandbox, type SandboxConfig } from './sandbox-manager';
import { setupOverlay, destroyOverlay, destroyAllOverlays } from './overlay-fs';
import { createProxy, destroyProxy, destroyAllProxies, type CIDRRule } from './tap-proxy';

// ---------------------------------------------------------------------------
// Configuration (mirrors IsolatePool env var naming)
// ---------------------------------------------------------------------------

const BASE_POOL_SIZE   = parseInt(process.env.SANDBOX_POOL_SIZE ?? '5', 10);
const MAX_POOL_SIZE    = parseInt(process.env.SANDBOX_MAX_POOL_SIZE ?? '20', 10);
const IDLE_TIMEOUT_MS  = parseInt(process.env.SANDBOX_IDLE_TIMEOUT_MS ?? '300000', 10);
const DEFAULT_MEMORY_MB = parseInt(process.env.SANDBOX_MEMORY_MB ?? '256', 10);
const DEFAULT_TMPFS_MB  = parseInt(process.env.SANDBOX_TMPFS_LIMIT_MB ?? '64', 10);
const CHECKPOINT_DIR   = process.env.CHECKPOINT_DIR || '/app/checkpoints';
const SOCKET_BASE      = process.env.SANDBOX_SOCKET_BASE || '/var/run/invoke-sandboxes';
const RUNTIME_IMAGE    = process.env.RUNTIME_IMAGE || 'ghcr.io/brian9206/invoke/runtime:latest';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface WarmPoolMetrics {
  active: number;
  idle: number;
  corrupted: number;
  poolSize: number;
  basePoolSize: number;
  maxPoolSize: number;
  totalCreated: number;
  totalDisposed: number;
  warmupComplete: boolean;
  coldStarts: number;
  avgRestoreMs: number;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

class WarmPool {
  private readyPool: Sandbox[] = [];
  private activeSandboxes = new Set<string>();
  private totalCreated = 0;
  private totalDisposed = 0;
  private corrupted = 0;
  private coldStarts = 0;
  private warmupComplete = false;
  private restoreTimes: number[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private defaultMemoryMb = DEFAULT_MEMORY_MB;

  // -----------------------------------------------------------------------
  // Initialisation — create one sandbox, checkpoint it, then fill the pool
  // -----------------------------------------------------------------------

  async initialize(memoryMb?: number): Promise<void> {
    if (memoryMb) this.defaultMemoryMb = memoryMb;

    // Create the base checkpoint
    const seedId = this.nextId();
    const seedConfig = this.makeConfig(seedId);

    // For the seed sandbox, mount a minimal empty dir as the code layer
    const emptyDir = path.join(CHECKPOINT_DIR, '_empty');
    await fs.mkdir(emptyDir, { recursive: true });

    const mergedDir = await setupOverlay(seedId, emptyDir, DEFAULT_TMPFS_MB);
    seedConfig.mergedDir = mergedDir;

    const seedSandbox = await sandboxManager.createSandbox(seedConfig);
    this.totalCreated++;

    // Checkpoint
    const checkpointPath = path.join(CHECKPOINT_DIR, 'base');
    await sandboxManager.checkpointSandbox(seedSandbox, checkpointPath);

    // Destroy the seed
    await sandboxManager.destroySandbox(seedSandbox);
    await destroyOverlay(seedId);
    this.totalDisposed++;

    // Fill the ready pool from the base checkpoint
    const restorePromises: Promise<void>[] = [];
    for (let i = 0; i < BASE_POOL_SIZE; i++) {
      restorePromises.push(this.restoreOne());
    }
    await Promise.all(restorePromises);

    this.warmupComplete = true;

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanupIdleExcess(), 60_000);
  }

  // -----------------------------------------------------------------------
  // Acquire — get a ready sandbox from the pool
  // -----------------------------------------------------------------------

  async acquire(functionDir: string, policies: CIDRRule[], memoryMb?: number): Promise<Sandbox> {
    if (this.isShuttingDown) {
      throw new Error('WarmPool is shutting down');
    }

    let sandbox: Sandbox | undefined;

    if (this.readyPool.length > 0) {
      sandbox = this.readyPool.shift()!;
    } else if (this.totalActive() < MAX_POOL_SIZE) {
      // Cold start — create on demand
      this.coldStarts++;
      sandbox = await this.createFresh(memoryMb);
    } else {
      // Back-pressure — wait for a sandbox to become available
      sandbox = await this.waitForAvailable();
    }

    sandbox.state = 'executing';
    this.activeSandboxes.add(sandbox.id);

    // Set up OverlayFS with the function code as the read-only lower layer
    const mergedDir = await setupOverlay(sandbox.id, functionDir, DEFAULT_TMPFS_MB);
    sandbox.config.mergedDir = mergedDir;

    // Set up TAP proxy with the function's network policies
    if (sandbox.config.tapFd !== undefined) {
      createProxy(sandbox.id, sandbox.config.tapFd, policies);
    }

    return sandbox;
  }

  // -----------------------------------------------------------------------
  // Release — destroy the dirty sandbox, restore a new one in background
  // -----------------------------------------------------------------------

  async release(sandbox: Sandbox, wasClean: boolean = true): Promise<void> {
    this.activeSandboxes.delete(sandbox.id);

    if (!wasClean) {
      this.corrupted++;
    }

    // Destroy the used sandbox
    destroyProxy(sandbox.id);
    await sandboxManager.destroySandbox(sandbox);
    await destroyOverlay(sandbox.id);
    this.totalDisposed++;

    // Replenish in background if pool is below target
    if (!this.isShuttingDown && this.readyPool.length < BASE_POOL_SIZE) {
      this.restoreOne().catch((err) => {
        console.error('[WarmPool] Background restore failed:', err);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  getMetrics(): WarmPoolMetrics {
    const restoreAvg = this.restoreTimes.length > 0
      ? this.restoreTimes.reduce((a, b) => a + b, 0) / this.restoreTimes.length
      : 0;

    return {
      active: this.activeSandboxes.size,
      idle: this.readyPool.length,
      corrupted: this.corrupted,
      poolSize: this.activeSandboxes.size + this.readyPool.length,
      basePoolSize: BASE_POOL_SIZE,
      maxPoolSize: MAX_POOL_SIZE,
      totalCreated: this.totalCreated,
      totalDisposed: this.totalDisposed,
      warmupComplete: this.warmupComplete,
      coldStarts: this.coldStarts,
      avgRestoreMs: Math.round(restoreAvg),
    };
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Wait for active sandboxes to finish (with 30s deadline)
    const deadline = Date.now() + 30_000;
    while (this.activeSandboxes.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Destroy all remaining sandboxes
    const destroyPromises: Promise<void>[] = [];

    for (const sandbox of this.readyPool) {
      destroyPromises.push(sandboxManager.destroySandbox(sandbox).catch(() => {}));
    }
    this.readyPool = [];

    await Promise.allSettled(destroyPromises);
    await destroyAllOverlays();
    destroyAllProxies();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private totalActive(): number {
    return this.activeSandboxes.size + this.readyPool.length;
  }

  private nextId(): string {
    return `sb-${crypto.randomBytes(8).toString('hex')}`;
  }

  private makeConfig(sandboxId: string, memoryMb?: number): SandboxConfig {
    const socketDir = path.join(SOCKET_BASE, sandboxId);
    return {
      sandboxId,
      memoryLimitMb: memoryMb || this.defaultMemoryMb,
      runtimeImage: RUNTIME_IMAGE,
      mergedDir: '',   // Set later after OverlayFS setup
      socketDir,
    };
  }

  private async restoreOne(): Promise<void> {
    const id = this.nextId();
    const config = this.makeConfig(id);
    const checkpointPath = path.join(CHECKPOINT_DIR, 'base');

    await fs.mkdir(config.socketDir, { recursive: true });

    const start = Date.now();
    const sandbox = await sandboxManager.restoreSandbox(id, checkpointPath, config);
    const elapsed = Date.now() - start;

    this.restoreTimes.push(elapsed);
    // Keep only last 100 measurements for running average
    if (this.restoreTimes.length > 100) this.restoreTimes.shift();

    this.totalCreated++;
    this.readyPool.push(sandbox);
  }

  private async createFresh(memoryMb?: number): Promise<Sandbox> {
    const id = this.nextId();
    const config = this.makeConfig(id, memoryMb);

    await fs.mkdir(config.socketDir, { recursive: true });

    const emptyDir = path.join(CHECKPOINT_DIR, '_empty');
    await fs.mkdir(emptyDir, { recursive: true });

    const mergedDir = await setupOverlay(id, emptyDir, DEFAULT_TMPFS_MB);
    config.mergedDir = mergedDir;

    const sandbox = await sandboxManager.createSandbox(config);
    this.totalCreated++;
    return sandbox;
  }

  private waitForAvailable(): Promise<Sandbox> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available sandbox (pool at max capacity)'));
      }, 30_000);

      const check = () => {
        if (this.readyPool.length > 0) {
          clearTimeout(timeout);
          resolve(this.readyPool.shift()!);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private cleanupIdleExcess(): void {
    if (this.isShuttingDown) return;

    // Trim excess idle sandboxes beyond base pool size
    while (this.readyPool.length > BASE_POOL_SIZE) {
      const sandbox = this.readyPool.pop()!;
      sandboxManager.destroySandbox(sandbox).catch(() => {});
      this.totalDisposed++;
    }

    // Remove sandboxes that have been idle too long
    const now = Date.now();
    const keptPool: Sandbox[] = [];

    for (const sandbox of this.readyPool) {
      if (now - sandbox.createdAt > IDLE_TIMEOUT_MS && keptPool.length >= BASE_POOL_SIZE) {
        sandboxManager.destroySandbox(sandbox).catch(() => {});
        this.totalDisposed++;
      } else {
        keptPool.push(sandbox);
      }
    }

    this.readyPool = keptPool;

    // Replenish if below base
    if (!this.isShuttingDown && this.readyPool.length < BASE_POOL_SIZE) {
      const deficit = BASE_POOL_SIZE - this.readyPool.length;
      for (let i = 0; i < deficit; i++) {
        this.restoreOne().catch((err) => {
          console.error('[WarmPool] Replenishment restore failed:', err);
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: WarmPool | null = null;

export function getWarmPool(): WarmPool {
  if (!instance) {
    instance = new WarmPool();
  }
  return instance;
}

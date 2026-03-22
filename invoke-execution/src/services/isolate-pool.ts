import ivm from 'isolated-vm';
import fs from 'fs';
import path from 'path';

type IsolateStatus = 'idle' | 'in-use' | 'corrupted';

interface PoolEntry {
  isolate: ivm.Isolate;
  compiledScript: ivm.Script;
  status: IsolateStatus;
  lastUsed: number;
  memoryLimitMb: number;
}

interface IsolatePoolMetrics {
  active: number;
  idle: number;
  corrupted: number;
  poolSize: number;
  basePoolSize: number;
  maxPoolSize: number;
  totalCreated: number;
  totalDisposed: number;
  warmupComplete: boolean;
}

/**
 * IsolatePool - Manages a pool of reusable V8 isolates, bucketed by 256 MB-aligned
 * memory tiers.
 *
 * The *default* tier (set via `setDefaultMemoryMb`) is always warm and maintained at
 * `basePoolSize` / `maxPoolSize`. Custom tiers are created on demand and kept alive
 * for `customTierTtlMs` after their last use. When global settings change the default
 * memory limit the pool is re-initialised transparently.
 *
 * NOTE: vm-modules/ and vm-bootstrap/ live at invoke-execution/bundles/.
 * After TypeScript compilation the JS output is at invoke-execution/dist/services/.
 * The paths below use ../../bundles/... to navigate up from dist/services/ to
 * invoke-execution/ and then back into bundles/.
 */
class IsolatePool {
  private basePoolSize: number;
  private maxPoolSize: number;
  private defaultMemoryMb: number;
  private idleTimeout: number;
  private customTierTtlMs: number;
  private suppressLogging: boolean;

  /** All isolates across all tiers, keyed by memory limit */
  private tierPools: Map<number, PoolEntry[]>;
  private totalCreated: number;
  private totalDisposed: number;
  private warmupComplete: boolean;
  private bootstrapCode: string;
  private cleanupInterval: NodeJS.Timeout | null;
  isShuttingDown: boolean;

  constructor() {
    this.basePoolSize = parseInt(process.env.ISOLATE_POOL_SIZE ?? '5', 10);
    this.maxPoolSize = parseInt(process.env.ISOLATE_MAX_POOL_SIZE ?? '20', 10);
    this.defaultMemoryMb = 256; // overwritten on initialize() via DB
    this.idleTimeout = parseInt(process.env.ISOLATE_IDLE_TIMEOUT_MS ?? '300000', 10);
    this.customTierTtlMs = 30_000;
    this.suppressLogging = process.env.ISOLATE_SUPPRESS_LOGGING === 'true';

    this.tierPools = new Map();
    this.totalCreated = 0;
    this.totalDisposed = 0;
    this.warmupComplete = false;

    // Paths to VM directories — adjusted for dist/services/ → bundles/ resolution
    const bundlesRoot = process.env.VM_BUNDLES_ROOT || path.join(__dirname, '../../bundles');
    const vmModulesPath = path.join(bundlesRoot, 'vm-modules');
    const vmBootstrapPath = path.join(bundlesRoot, 'vm-bootstrap');

    this.bootstrapCode = 'globalThis.global = globalThis;\n';
    this.bootstrapCode += 'let _loadBuiltinModules = () => {\n';
    this.bootstrapCode += 'const modules = {};\n';
    fs.readdirSync(vmModulesPath)
      .filter((file) => file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b))
      .forEach((file) => {
        this.bootstrapCode += `modules[${JSON.stringify(path.basename(file, '.js'))}] = () => {\n`;
        this.bootstrapCode += `const module = { exports: {} }; const exports = module.exports;\n`;
        this.bootstrapCode += `${fs.readFileSync(path.join(vmModulesPath, file), 'utf8')};\n`;
        this.bootstrapCode += `return module;\n`;
        this.bootstrapCode += `};\n`;
      });
    this.bootstrapCode += 'delete _loadBuiltinModules;\n';
    this.bootstrapCode += 'return modules;\n';
    this.bootstrapCode += '}\n';

    fs.readdirSync(vmBootstrapPath)
      .filter((file) => file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b))
      .forEach((file) => {
        this.bootstrapCode +=
          fs.readFileSync(path.join(vmBootstrapPath, file), 'utf8') + ';\n';
      });

    this.cleanupInterval = null;
    this.isShuttingDown = false;
  }

  /** Set the default memory tier and warm up the default pool. */
  async initialize(defaultMemoryMb = 256): Promise<void> {
    this.defaultMemoryMb = defaultMemoryMb;

    if (!this.suppressLogging) {
      console.log(
        `[IsolatePool] Initializing with base size: ${this.basePoolSize}, max size: ${this.maxPoolSize}, default memory: ${this.defaultMemoryMb} MB`,
      );
    }

    await this._warmUp(this.defaultMemoryMb);

    this.cleanupInterval = setInterval(() => this._cleanupIdleIsolates(), 60_000);
  }

  /**
   * Update the default memory tier (called when global settings change).
   * Tears down the old default pool and warms up a new one.
   */
  async updateDefaultMemory(newDefaultMb: number): Promise<void> {
    if (newDefaultMb === this.defaultMemoryMb) return;

    console.log(
      `[IsolatePool] Default memory changed ${this.defaultMemoryMb} MB → ${newDefaultMb} MB, rebuilding default pool`,
    );

    const oldDefault = this.defaultMemoryMb;
    this.defaultMemoryMb = newDefaultMb;

    // Dispose old default pool (in-use ones will be disposed on release)
    const oldPool = this.tierPools.get(oldDefault) ?? [];
    for (const entry of [...oldPool]) {
      if (entry.status !== 'in-use') {
        this._disposeIsolate(entry, oldDefault);
      }
    }

    await this._warmUp(newDefaultMb);
  }

  private getTierPool(memoryMb: number): PoolEntry[] {
    if (!this.tierPools.has(memoryMb)) {
      this.tierPools.set(memoryMb, []);
    }
    return this.tierPools.get(memoryMb)!;
  }

  private async _warmUp(memoryMb: number): Promise<void> {
    if (!this.suppressLogging) {
      console.log(`[IsolatePool] Warming up ${this.basePoolSize} isolates at ${memoryMb} MB…`);
    }

    const promises: Promise<ivm.Isolate>[] = [];
    for (let i = 0; i < this.basePoolSize; i++) {
      promises.push(this._createIsolate(memoryMb));
    }
    await Promise.all(promises);

    this.warmupComplete = true;
    if (!this.suppressLogging) {
      const pool = this.getTierPool(memoryMb);
      console.log(`[IsolatePool] Warm-up complete. ${pool.length} isolates ready at ${memoryMb} MB.`);
    }
  }

  private async _createIsolate(memoryMb: number): Promise<ivm.Isolate> {
    try {
      const isolate = new ivm.Isolate({ memoryLimit: memoryMb });
      const compiledScript = await isolate.compileScript(this.bootstrapCode);

      const entry: PoolEntry = {
        isolate,
        compiledScript,
        status: 'idle',
        lastUsed: Date.now(),
        memoryLimitMb: memoryMb,
      };

      this.getTierPool(memoryMb).push(entry);
      this.totalCreated++;
      return isolate;
    } catch (error) {
      console.error(`[IsolatePool] Error creating isolate at ${memoryMb} MB:`, error);
      throw error;
    }
  }

  /**
   * Acquire an isolate for the given memory tier.
   * If memoryMb equals the default tier, uses the warm pool.
   * Otherwise, creates or reuses a custom-tier isolate.
   */
  async acquireWithMemory(memoryMb: number): Promise<{ isolate: ivm.Isolate; context: ivm.Context; compiledScript: ivm.Script }> {
    if (this.isShuttingDown) {
      throw new Error('IsolatePool is shutting down');
    }

    const pool = this.getTierPool(memoryMb);
    const isDefaultTier = memoryMb === this.defaultMemoryMb;

    let poolEntry = pool.find((entry) => entry.status === 'idle');

    if (!poolEntry) {
      const maxSize = isDefaultTier ? this.maxPoolSize : Math.ceil(this.maxPoolSize / 2);
      if (pool.length < maxSize) {
        await this._createIsolate(memoryMb);
        poolEntry = pool[pool.length - 1];
      }
    }

    if (!poolEntry) {
      throw new Error(`No isolates available for ${memoryMb} MB tier and pool is at maximum size`);
    }

    poolEntry.status = 'in-use';
    poolEntry.lastUsed = Date.now();

    const context = await poolEntry.isolate.createContext();
    return { isolate: poolEntry.isolate, context, compiledScript: poolEntry.compiledScript };
  }

  /** Backwards-compatible acquire using the default memory tier. */
  async acquire(): Promise<{ isolate: ivm.Isolate; context: ivm.Context; compiledScript: ivm.Script }> {
    return this.acquireWithMemory(this.defaultMemoryMb);
  }

  release(isolate: ivm.Isolate, isHealthy = true): void {
    for (const [memoryMb, pool] of this.tierPools) {
      const poolEntry = pool.find((entry) => entry.isolate === isolate);
      if (!poolEntry) continue;

      if (!isHealthy) {
        console.log(`[IsolatePool] Isolate (${memoryMb} MB) marked as corrupted, disposing`);
        poolEntry.status = 'corrupted';
        this._disposeIsolate(poolEntry, memoryMb);

        // Replenish default tier only
        if (memoryMb === this.defaultMemoryMb) {
          const defaultPool = this.getTierPool(this.defaultMemoryMb);
          if (defaultPool.filter((e) => e.status !== 'corrupted').length < this.basePoolSize) {
            this._createIsolate(this.defaultMemoryMb).catch((err) => {
              console.error('[IsolatePool] Error creating replacement isolate:', err);
            });
          }
        }
      } else {
        poolEntry.status = 'idle';
        poolEntry.lastUsed = Date.now();
      }
      return;
    }

    console.warn('[IsolatePool] Attempted to release unknown isolate');
  }

  private _disposeIsolate(poolEntry: PoolEntry, memoryMb: number): void {
    try {
      poolEntry.isolate.dispose();
      this.totalDisposed++;
    } catch (error) {
      console.error('[IsolatePool] Error disposing isolate:', error);
    }

    const pool = this.tierPools.get(memoryMb);
    if (pool) {
      const index = pool.indexOf(poolEntry);
      if (index > -1) pool.splice(index, 1);
      if (pool.length === 0) this.tierPools.delete(memoryMb);
    }
  }

  private _cleanupIdleIsolates(): void {
    const now = Date.now();

    for (const [memoryMb, pool] of this.tierPools) {
      const isDefaultTier = memoryMb === this.defaultMemoryMb;
      const idleEntries = pool.filter((e) => e.status === 'idle');

      if (isDefaultTier) {
        // Default tier: trim excess idle isolates beyond basePoolSize
        const excessCount = idleEntries.length - this.basePoolSize;
        if (excessCount > 0) {
          idleEntries.sort((a, b) => a.lastUsed - b.lastUsed);
          for (let i = 0; i < excessCount; i++) {
            const entry = idleEntries[i];
            if (now - entry.lastUsed > this.idleTimeout) {
              console.log(`[IsolatePool] Disposing idle default-tier isolate (${memoryMb} MB, exceeded timeout)`);
              this._disposeIsolate(entry, memoryMb);
            }
          }
        }
      } else {
        // Custom tier: dispose all idle isolates beyond customTierTtlMs
        for (const entry of [...idleEntries]) {
          if (now - entry.lastUsed > this.customTierTtlMs) {
            console.log(`[IsolatePool] Disposing idle custom-tier isolate (${memoryMb} MB, TTL expired)`);
            this._disposeIsolate(entry, memoryMb);
          }
        }
      }
    }
  }

  getMetrics(): IsolatePoolMetrics {
    let active = 0, idle = 0, corrupted = 0, total = 0;
    for (const pool of this.tierPools.values()) {
      active += pool.filter((e) => e.status === 'in-use').length;
      idle += pool.filter((e) => e.status === 'idle').length;
      corrupted += pool.filter((e) => e.status === 'corrupted').length;
      total += pool.length;
    }

    return {
      active,
      idle,
      corrupted,
      poolSize: total,
      basePoolSize: this.basePoolSize,
      maxPoolSize: this.maxPoolSize,
      totalCreated: this.totalCreated,
      totalDisposed: this.totalDisposed,
      warmupComplete: this.warmupComplete,
    };
  }

  async shutdown(timeoutMs = 30_000): Promise<void> {
    if (!this.suppressLogging) console.log('[IsolatePool] Starting graceful shutdown...');
    this.isShuttingDown = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      let active = 0;
      for (const pool of this.tierPools.values()) {
        active += pool.filter((e) => e.status === 'in-use').length;
      }
      if (active === 0) break;
      console.log(`[IsolatePool] Waiting for ${active} active executions...`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    for (const [memoryMb, pool] of this.tierPools) {
      for (const entry of [...pool]) {
        this._disposeIsolate(entry, memoryMb);
      }
    }

    if (!this.suppressLogging) console.log('[IsolatePool] Shutdown complete');
  }
}

let instance: IsolatePool | null = null;

export function getInstance(): IsolatePool {
  if (!instance) {
    instance = new IsolatePool();
  }
  return instance;
}

export function resetInstance(): void {
  instance = null;
}

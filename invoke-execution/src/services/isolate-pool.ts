import ivm from 'isolated-vm';
import fs from 'fs';
import path from 'path';

type IsolateStatus = 'idle' | 'in-use' | 'corrupted';

interface PoolEntry {
  isolate: ivm.Isolate;
  compiledScript: ivm.Script;
  status: IsolateStatus;
  lastUsed: number;
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
 * IsolatePool - Manages a pool of reusable V8 isolates.
 * Provides dynamic scaling, health tracking, and automatic recovery.
 *
 * NOTE: vm-modules/ and vm-bootstrap/ live at invoke-execution/bundles/.
 * After TypeScript compilation the JS output is at invoke-execution/dist/services/.
 * The paths below use ../../bundles/... to navigate up from dist/services/ to
 * invoke-execution/ and then back into bundles/.
 */
class IsolatePool {
  private basePoolSize: number;
  private maxPoolSize: number;
  private memoryLimit: number;
  private idleTimeout: number;
  private suppressLogging: boolean;
  private isolates: PoolEntry[];
  private totalCreated: number;
  private totalDisposed: number;
  private warmupComplete: boolean;
  private bootstrapCode: string;
  private cleanupInterval: NodeJS.Timeout | null;
  isShuttingDown: boolean;

  constructor() {
    this.basePoolSize = parseInt(process.env.ISOLATE_POOL_SIZE ?? '5', 10);
    this.maxPoolSize = parseInt(process.env.ISOLATE_MAX_POOL_SIZE ?? '20', 10);
    this.memoryLimit = parseInt(process.env.ISOLATE_MEMORY_LIMIT_MB ?? '128', 10);
    this.idleTimeout = parseInt(process.env.ISOLATE_IDLE_TIMEOUT_MS ?? '300000', 10);
    this.suppressLogging = process.env.ISOLATE_SUPPRESS_LOGGING === 'true';

    this.isolates = [];
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

  async initialize(): Promise<void> {
    if (!this.suppressLogging) {
      console.log(
        `[IsolatePool] Initializing with base size: ${this.basePoolSize}, max size: ${this.maxPoolSize}`,
      );
    }

    await this._warmUp();

    this.cleanupInterval = setInterval(() => this._cleanupIdleIsolates(), 60_000);
  }

  private async _warmUp(): Promise<void> {
    if (!this.suppressLogging) console.log('[IsolatePool] Starting warm-up...');

    const promises: Promise<ivm.Isolate>[] = [];
    for (let i = 0; i < this.basePoolSize; i++) {
      promises.push(this._createIsolate());
    }

    await Promise.all(promises);

    this.warmupComplete = true;
    if (!this.suppressLogging) {
      console.log(`[IsolatePool] Warm-up complete. ${this.isolates.length} isolates ready.`);
    }
  }

  private async _createIsolate(): Promise<ivm.Isolate> {
    try {
      const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });

      const compiledScript = await isolate.compileScript(this.bootstrapCode);

      this.isolates.push({
        isolate,
        compiledScript,
        status: 'idle',
        lastUsed: Date.now(),
      });

      this.totalCreated++;

      return isolate;
    } catch (error) {
      console.error('[IsolatePool] Error creating isolate:', error);
      throw error;
    }
  }

  async acquire(): Promise<{ isolate: ivm.Isolate; context: ivm.Context; compiledScript: ivm.Script }> {
    if (this.isShuttingDown) {
      throw new Error('IsolatePool is shutting down');
    }

    let poolEntry = this.isolates.find((entry) => entry.status === 'idle');

    if (!poolEntry && this.isolates.length < this.maxPoolSize) {
      await this._createIsolate();
      poolEntry = this.isolates[this.isolates.length - 1];
    }

    if (!poolEntry) {
      throw new Error('No isolates available and pool at maximum size');
    }

    poolEntry.status = 'in-use';
    poolEntry.lastUsed = Date.now();

    const context = await poolEntry.isolate.createContext();

    return { isolate: poolEntry.isolate, context, compiledScript: poolEntry.compiledScript };
  }

  release(isolate: ivm.Isolate, isHealthy = true): void {
    const poolEntry = this.isolates.find((entry) => entry.isolate === isolate);

    if (!poolEntry) {
      console.warn('[IsolatePool] Attempted to release unknown isolate');
      return;
    }

    if (!isHealthy) {
      console.log('[IsolatePool] Isolate marked as corrupted, disposing');
      poolEntry.status = 'corrupted';
      this._disposeIsolate(poolEntry);

      if (this.isolates.filter((e) => e.status !== 'corrupted').length < this.basePoolSize) {
        this._createIsolate().catch((err) => {
          console.error('[IsolatePool] Error creating replacement isolate:', err);
        });
      }
    } else {
      poolEntry.status = 'idle';
      poolEntry.lastUsed = Date.now();
    }
  }

  private _disposeIsolate(poolEntry: PoolEntry): void {
    try {
      poolEntry.isolate.dispose();
      this.totalDisposed++;
    } catch (error) {
      console.error('[IsolatePool] Error disposing isolate:', error);
    }

    const index = this.isolates.indexOf(poolEntry);
    if (index > -1) {
      this.isolates.splice(index, 1);
    }
  }

  private _cleanupIdleIsolates(): void {
    const now = Date.now();
    const entriesToCleanup: PoolEntry[] = [];

    const idleEntries = this.isolates.filter((e) => e.status === 'idle');
    const excessCount = idleEntries.length - this.basePoolSize;

    if (excessCount > 0) {
      idleEntries.sort((a, b) => a.lastUsed - b.lastUsed);

      for (let i = 0; i < excessCount; i++) {
        const entry = idleEntries[i];
        if (now - entry.lastUsed > this.idleTimeout) {
          entriesToCleanup.push(entry);
        }
      }
    }

    for (const entry of entriesToCleanup) {
      console.log('[IsolatePool] Disposing idle isolate (exceeded timeout)');
      this._disposeIsolate(entry);
    }
  }

  getMetrics(): IsolatePoolMetrics {
    const active = this.isolates.filter((e) => e.status === 'in-use').length;
    const idle = this.isolates.filter((e) => e.status === 'idle').length;
    const corrupted = this.isolates.filter((e) => e.status === 'corrupted').length;

    return {
      active,
      idle,
      corrupted,
      poolSize: this.isolates.length,
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
      const active = this.isolates.filter((e) => e.status === 'in-use').length;
      if (active === 0) break;

      console.log(`[IsolatePool] Waiting for ${active} active executions...`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const active = this.isolates.filter((e) => e.status === 'in-use').length;
    if (active > 0) {
      console.warn(`[IsolatePool] Forcing shutdown with ${active} active executions`);
    }

    for (const entry of [...this.isolates]) {
      this._disposeIsolate(entry);
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

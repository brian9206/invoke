const ivm = require('isolated-vm');

/**
 * IsolatePool - Manages a pool of reusable V8 isolates
 * Provides dynamic scaling, health tracking, and automatic recovery
 */
class IsolatePool {
    constructor() {
        // Configuration from environment variables
        this.basePoolSize = parseInt(process.env.ISOLATE_POOL_SIZE || '5', 10);
        this.maxPoolSize = parseInt(process.env.ISOLATE_MAX_POOL_SIZE || '20', 10);
        this.memoryLimit = parseInt(process.env.ISOLATE_MEMORY_LIMIT_MB || '128', 10);
        this.idleTimeout = parseInt(process.env.ISOLATE_IDLE_TIMEOUT_MS || '300000', 10); // 5 minutes
        
        // Pool state
        this.isolates = []; // { isolate, status: 'idle'|'in-use'|'corrupted', lastUsed: timestamp }
        this.totalCreated = 0;
        this.totalDisposed = 0;
        this.warmupComplete = false;
        
        // Bootstrap code (compiled per-context, not pre-compiled)
        this.bootstrapCode = null;
        
        // Cleanup interval
        this.cleanupInterval = null;
        
        // Shutdown state
        this.isShuttingDown = false;
    }
    
    /**
     * Initialize the pool and start async warm-up
     */
    async initialize() {
        console.log(`[IsolatePool] Initializing with base size: ${this.basePoolSize}, max size: ${this.maxPoolSize}`);
        
        // Start warm-up and wait for it to complete
        await this._warmUp();
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this._cleanupIdleIsolates(), 60000); // Check every minute
    }
    
    /**
     * Warm up the pool by pre-creating base pool size isolates
     */
    async _warmUp() {
        console.log('[IsolatePool] Starting warm-up...');
        
        const promises = [];
        for (let i = 0; i < this.basePoolSize; i++) {
            promises.push(this._createIsolate());
        }
        
        await Promise.all(promises);
        
        this.warmupComplete = true;
        console.log(`[IsolatePool] Warm-up complete. ${this.isolates.length} isolates ready.`);
    }
    
    /**
     * Create a new isolate and add it to the pool
     */
    async _createIsolate() {
        try {
            const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
            
            this.isolates.push({
                isolate,
                status: 'idle',
                lastUsed: Date.now()
            });
            
            this.totalCreated++;
            
            return isolate;
        } catch (error) {
            console.error('[IsolatePool] Error creating isolate:', error);
            throw error;
        }
    }
    
    /**
     * Acquire an isolate from the pool
     * Creates a new context for the isolate
     * @returns {Promise<{ isolate, context }>}
     */
    async acquire() {
        if (this.isShuttingDown) {
            throw new Error('IsolatePool is shutting down');
        }
        
        // Find an idle isolate
        let poolEntry = this.isolates.find(entry => entry.status === 'idle');
        
        // If no idle isolate and pool not at max, create new one
        if (!poolEntry && this.isolates.length < this.maxPoolSize) {
            const isolate = await this._createIsolate();
            poolEntry = this.isolates[this.isolates.length - 1];
        }
        
        // If still no isolate available, wait or throw
        if (!poolEntry) {
            throw new Error('No isolates available and pool at maximum size');
        }
        
        // Mark as in-use
        poolEntry.status = 'in-use';
        poolEntry.lastUsed = Date.now();
        
        // Create a fresh context for this execution
        const context = await poolEntry.isolate.createContext();
        
        return { isolate: poolEntry.isolate, context };
    }
    
    /**
     * Release an isolate back to the pool
     * @param {Isolate} isolate - The isolate to release
     * @param {boolean} isHealthy - Whether the isolate is still healthy
     */
    release(isolate, isHealthy = true) {
        const poolEntry = this.isolates.find(entry => entry.isolate === isolate);
        
        if (!poolEntry) {
            console.warn('[IsolatePool] Attempted to release unknown isolate');
            return;
        }
        
        if (!isHealthy) {
            // Mark as corrupted and dispose
            console.log('[IsolatePool] Isolate marked as corrupted, disposing');
            poolEntry.status = 'corrupted';
            this._disposeIsolate(poolEntry);
            
            // Create replacement in background if below base size
            if (this.isolates.filter(e => e.status !== 'corrupted').length < this.basePoolSize) {
                this._createIsolate().catch(err => {
                    console.error('[IsolatePool] Error creating replacement isolate:', err);
                });
            }
        } else {
            // Return to idle state
            poolEntry.status = 'idle';
            poolEntry.lastUsed = Date.now();
        }
    }
    
    /**
     * Dispose an isolate and remove it from the pool
     */
    _disposeIsolate(poolEntry) {
        try {
            poolEntry.isolate.dispose();
            this.totalDisposed++;
        } catch (error) {
            console.error('[IsolatePool] Error disposing isolate:', error);
        }
        
        // Remove from pool
        const index = this.isolates.indexOf(poolEntry);
        if (index > -1) {
            this.isolates.splice(index, 1);
        }
    }
    
    /**
     * Cleanup idle isolates that exceed timeout
     */
    _cleanupIdleIsolates() {
        const now = Date.now();
        const entriesToCleanup = [];
        
        // Find idle isolates beyond timeout that exceed base pool size
        const idleEntries = this.isolates.filter(e => e.status === 'idle');
        const excessCount = idleEntries.length - this.basePoolSize;
        
        if (excessCount > 0) {
            // Sort by last used (oldest first)
            idleEntries.sort((a, b) => a.lastUsed - b.lastUsed);
            
            for (let i = 0; i < excessCount; i++) {
                const entry = idleEntries[i];
                if (now - entry.lastUsed > this.idleTimeout) {
                    entriesToCleanup.push(entry);
                }
            }
        }
        
        // Dispose excess idle isolates
        for (const entry of entriesToCleanup) {
            console.log('[IsolatePool] Disposing idle isolate (exceeded timeout)');
            this._disposeIsolate(entry);
        }
    }
    
    /**
     * Get pool metrics
     */
    getMetrics() {
        const active = this.isolates.filter(e => e.status === 'in-use').length;
        const idle = this.isolates.filter(e => e.status === 'idle').length;
        const corrupted = this.isolates.filter(e => e.status === 'corrupted').length;
        
        return {
            active,
            idle,
            corrupted,
            poolSize: this.isolates.length,
            basePoolSize: this.basePoolSize,
            maxPoolSize: this.maxPoolSize,
            totalCreated: this.totalCreated,
            totalDisposed: this.totalDisposed,
            warmupComplete: this.warmupComplete
        };
    }
    
    /**
     * Graceful shutdown - wait for active executions then dispose all isolates
     * @param {number} timeoutMs - Maximum time to wait for active executions (default 30s)
     */
    async shutdown(timeoutMs = 30000) {
        console.log('[IsolatePool] Starting graceful shutdown...');
        this.isShuttingDown = true;
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        const startTime = Date.now();
        
        // Wait for active executions to complete
        while (Date.now() - startTime < timeoutMs) {
            const active = this.isolates.filter(e => e.status === 'in-use').length;
            if (active === 0) {
                break;
            }
            
            console.log(`[IsolatePool] Waiting for ${active} active executions...`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const active = this.isolates.filter(e => e.status === 'in-use').length;
        if (active > 0) {
            console.warn(`[IsolatePool] Forcing shutdown with ${active} active executions`);
        }
        
        // Dispose all isolates
        for (const entry of [...this.isolates]) {
            this._disposeIsolate(entry);
        }
        
        console.log('[IsolatePool] Shutdown complete');
    }
}

// Export singleton instance
let instance = null;

module.exports = {
    getInstance() {
        if (!instance) {
            instance = new IsolatePool();
        }
        return instance;
    }
};

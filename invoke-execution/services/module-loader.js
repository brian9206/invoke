const path = require('path');

/**
 * ModuleLoader - Provides CommonJS module loading in isolated-vm
 * Supports relative requires, built-in modules, and virtualized modules (fs, path)
 * Implements dual-level caching: per-execution and function-level
 */
class ModuleLoader {
    // Class-level shared cache for compiled modules
    static sharedCache = new Map(); // key: functionId:packageHash:modulePath, value: { script, lastAccess }
    static cacheEnabled = process.env.ENABLE_MODULE_CACHE !== 'false'; // default true
    static maxCacheSize = parseInt(process.env.MODULE_CACHE_MAX_SIZE || '1000', 10);
    
    constructor(vfs, isolate, context, functionId, packageHash, packageDir) {
        this.vfs = vfs;
        this.isolate = isolate;
        this.context = context;
        this.functionId = functionId;
        this.packageHash = packageHash;
        this.packageDir = packageDir;
        
        // Per-execution module cache for circular dependencies
        this.executionCache = new Map(); // key: fullPath, value: exports
        
        // Built-in modules that are allowed
        this.allowedBuiltins = [
            'crypto', 'buffer', 'url', 'querystring', 'util',
            'stream', 'events', 'zlib', 'string_decoder'
        ];
    }
    
    /**
     * Create a require function for a specific directory context
     * @param {string} currentDir - The current directory for resolving relative paths
     * @returns {Function} The require function
     */
    createRequire(currentDir) {
        const self = this;
        
        return async function require(moduleName) {
            // Handle relative requires
            if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                return await self._loadRelativeModule(moduleName, currentDir);
            }
            
            // Handle virtualized fs module
            if (moduleName === 'fs') {
                throw new Error('fs module must be provided by FSBridge');
            }
            
            // Handle virtualized path module
            if (moduleName === 'path') {
                throw new Error('path module must be provided by VFS');
            }
            
            // Handle built-in modules
            if (self.allowedBuiltins.includes(moduleName)) {
                return require(moduleName); // Use native Node.js require
            }
            
            // Strip node: prefix if present
            const cleanModuleName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
            if (self.allowedBuiltins.includes(cleanModuleName)) {
                return require(cleanModuleName);
            }
            
            throw new Error(`Module '${moduleName}' is not allowed in sandbox environment`);
        };
    }
    
    /**
     * Load a relative module (./utils.js, ../config/settings.js)
     */
    async _loadRelativeModule(moduleName, currentDir) {
        // Resolve the full path
        const requestedPath = path.resolve(currentDir, moduleName);
        
        // Security check: ensure path is within package directory
        const normalizedRequested = path.normalize(requestedPath);
        const normalizedPackage = path.normalize(this.packageDir);
        
        if (!normalizedRequested.startsWith(normalizedPackage)) {
            throw new Error(`Module '${moduleName}' is outside package directory`);
        }
        
        // Check per-execution cache (for circular dependencies)
        if (this.executionCache.has(normalizedRequested)) {
            return this.executionCache.get(normalizedRequested);
        }
        
        // Resolve to actual file path
        const filePath = this._resolveModulePath(normalizedRequested);
        
        // Check per-execution cache with resolved path
        if (this.executionCache.has(filePath)) {
            return this.executionCache.get(filePath);
        }
        
        // Read module code from VFS
        const virtualPath = this.vfs.toVirtualPath(filePath);
        const fs = this.vfs.createNodeFSModule();
        const code = fs.readFileSync(virtualPath, 'utf8');
        
        // Get or compile script (with function-level caching)
        const script = await this._getCompiledScript(filePath, virtualPath, code);
        
        // Create module context
        const moduleObj = { exports: {} };
        
        // Add to execution cache BEFORE executing (for circular deps)
        this.executionCache.set(filePath, moduleObj.exports);
        
        // Wrap and execute module
        const exports = await this._executeModule(script, filePath, moduleObj);
        
        // Update execution cache with final exports
        this.executionCache.set(filePath, exports);
        
        return exports;
    }
    
    /**
     * Resolve module path (try .js extension and index.js)
     */
    _resolveModulePath(requestedPath) {
        const fs = this.vfs.createNodeFSModule();
        
        // Try the exact path first
        try {
            const virtualPath = this.vfs.toVirtualPath(requestedPath);
            if (fs.existsSync(virtualPath)) {
                const stats = fs.statSync(virtualPath);
                if (stats.isFile) {
                    return requestedPath;
                }
            }
        } catch (error) {
            // Path doesn't exist, try extensions
        }
        
        // Try with .js extension
        const jsPath = requestedPath + '.js';
        try {
            const virtualPath = this.vfs.toVirtualPath(jsPath);
            if (fs.existsSync(virtualPath)) {
                return jsPath;
            }
        } catch (error) {
            // Continue trying
        }
        
        // Try index.js in directory
        const indexPath = path.join(requestedPath, 'index.js');
        try {
            const virtualPath = this.vfs.toVirtualPath(indexPath);
            if (fs.existsSync(virtualPath)) {
                return indexPath;
            }
        } catch (error) {
            // Continue trying
        }
        
        throw new Error(`Cannot find module '${requestedPath}'`);
    }
    
    /**
     * Get compiled script from cache or compile it
     */
    async _getCompiledScript(filePath, virtualPath, code) {
        // Check function-level cache if enabled
        if (ModuleLoader.cacheEnabled) {
            const cacheKey = `${this.functionId}:${this.packageHash}:${virtualPath}`;
            const cached = ModuleLoader.sharedCache.get(cacheKey);
            
            if (cached) {
                // Update last access time
                cached.lastAccess = Date.now();
                return cached.script;
            }
            
            // Compile and cache
            const script = await this._compileModule(code, virtualPath);
            
            // Add to cache
            ModuleLoader.sharedCache.set(cacheKey, {
                script,
                lastAccess: Date.now()
            });
            
            // Enforce cache size limit with LRU eviction
            this._enforceCacheLimit();
            
            return script;
        } else {
            // Caching disabled, just compile
            return await this._compileModule(code, virtualPath);
        }
    }
    
    /**
     * Compile module code with CommonJS wrapper
     */
    async _compileModule(code, virtualPath) {
        // Wrap code in CommonJS wrapper
        const wrappedCode = `(function(module, exports, require, __filename, __dirname) {\n${code}\nreturn module.exports;\n})\n//# sourceURL=${virtualPath}`;
        
        // Compile script in isolate
        const script = await this.isolate.compileScript(wrappedCode);
        
        return script;
    }
    
    /**
     * Execute module and return exports
     */
    async _executeModule(script, filePath, moduleObj) {
        // Run the wrapped script to get the factory function
        const factory = await script.run(this.context);
        
        // Create require function for this module's directory
        const moduleDir = path.dirname(filePath);
        const requireFn = this.createRequire(moduleDir);
        
        // Get virtual paths for __filename and __dirname
        const virtualFilename = this.vfs.toVirtualPath(filePath);
        const virtualDirname = this.vfs.toVirtualPath(moduleDir);
        
        // Execute the factory function with proper arguments
        // Note: We can't pass the actual moduleObj directly across isolate boundary
        // Instead, we'll execute the factory and it will modify module.exports internally
        await factory.apply(undefined, [
            moduleObj,           // module
            moduleObj.exports,   // exports
            requireFn,           // require
            virtualFilename,     // __filename
            virtualDirname       // __dirname
        ]);
        
        return moduleObj.exports;
    }
    
    /**
     * Enforce cache size limit with LRU eviction
     */
    _enforceCacheLimit() {
        if (ModuleLoader.sharedCache.size <= ModuleLoader.maxCacheSize) {
            return;
        }
        
        // Sort by last access time (oldest first)
        const entries = Array.from(ModuleLoader.sharedCache.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        
        // Remove oldest entries until we're under the limit
        const toRemove = entries.length - ModuleLoader.maxCacheSize;
        for (let i = 0; i < toRemove; i++) {
            ModuleLoader.sharedCache.delete(entries[i][0]);
        }
    }
    
    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            totalEntries: ModuleLoader.sharedCache.size,
            maxSize: ModuleLoader.maxCacheSize,
            cacheEnabled: ModuleLoader.cacheEnabled
        };
    }
    
    /**
     * Clear the entire shared cache
     */
    static clearCache() {
        ModuleLoader.sharedCache.clear();
    }
}

module.exports = ModuleLoader;

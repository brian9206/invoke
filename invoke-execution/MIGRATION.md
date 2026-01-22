# Execution Engine Rewrite - isolated-vm Migration

## Overview

This document describes the complete rewrite of the execution engine from `vm2` to `isolated-vm` with `sandbox-fs`. The new implementation provides true V8-level isolation, improved security, and better performance through isolate and module caching.

## Key Changes

### 1. **Replaced vm2 with isolated-vm**
- **Old**: vm2 package (deprecated and insecure)
- **New**: isolated-vm v4.7.0 (separate V8 isolates with true memory isolation)
- **Benefit**: Each function executes in a completely separate V8 isolate with its own heap

### 2. **Added sandbox-fs for Filesystem Access**
- **Purpose**: Provides read-only virtual filesystem for user functions
- **Behavior**: Automatically sanitizes paths in errors, preventing path traversal
- **API**: Exposes full Node.js `fs` API (sync, async, promises, streams)

### 3. **New Architecture - Class-Based Design**

#### **IsolatePool** (`services/isolate-pool.js`)
- Manages reusable V8 isolates for performance
- Dynamic pool sizing: base 5, max 20 (configurable)
- Async warm-up on initialization
- Auto-replacement of corrupted isolates
- Health tracking and idle cleanup
- Graceful shutdown with 30s timeout

#### **ModuleLoader** (`services/module-loader.js`)
- Provides CommonJS `require()` in isolates
- Supports relative (`./utils.js`) and built-in (`fs`, `path`) modules
- **Dual-level caching**:
  1. Per-execution cache for circular dependency resolution
  2. Function-level cache keyed by `functionId:packageHash:modulePath`
- LRU eviction when cache exceeds max size
- CommonJS wrapper: `(function(module, exports, require, __filename, __dirname){...})`

#### **FSBridge** (`services/fs-bridge.js`)
- Exposes sandbox-fs VFS API to isolate via `ivm.Reference`
- Implements all `fs` methods (sync, async, promises, streams)
- Serializes `fs.Stats` objects for cross-boundary transfer
- Security: All file access restricted to package directory

#### **ExecutionContext** (`services/execution-context.js`)
- Manages per-execution lifecycle
- Creates VFS instance for package directory
- Bootstraps isolate with globals (console, Buffer, timers, process.env)
- Sets up Express-compatible `req` and `res` objects
- Captures console logs to array
- Cleanup: closes VFS and disposes context

#### **ExecutionEngine** (`services/execution.js`)
- Singleton orchestrating execution flow
- Main method: `executeFunction(indexPath, context, functionId)`
- Flow:
  1. Fetch metadata (includes `package_hash`)
  2. Download package from MinIO (with caching)
  3. Acquire isolate from pool
  4. Create ExecutionContext
  5. Bootstrap environment
  6. Load `/index.js` via ModuleLoader
  7. Validate exports is a function
  8. Invoke with timeout
  9. Extract response and logs
  10. Release isolate (healthy/corrupted)
  11. Cleanup and return result

### 4. **Preserved Helper Functions**
All existing helper functions remain unchanged for backward compatibility:
- `getFunctionPackage()`: Downloads from MinIO with cache
- `fetchFunctionMetadata()`: Queries function + version data with `package_hash`
- `fetchEnvironmentVariables()`: Queries env vars from DB
- `createConsoleObject()`: Creates log capture object
- `createRequestObject()`: Creates Express-compatible `req`
- `createResponseObject()`: Creates mock `res` with method chaining
- `createExecutionContext()`: Wrapper for creating execution context

### 5. **New Metrics Endpoint**
- Route: `GET /metrics`
- Returns JSON with:
  - **Isolate Pool**: total/available/active/corrupted/created/destroyed counts
  - **Module Cache**: size/hits/misses/evictions/hitRate

### 6. **Environment Variables**

New configuration options (see `.env.example`):

```bash
# Execution Engine Configuration
ISOLATE_POOL_SIZE=5                    # Base number of pre-warmed isolates
ISOLATE_MAX_POOL_SIZE=20               # Maximum isolates in pool
ISOLATE_MEMORY_LIMIT_MB=128            # Memory limit per isolate (MB)
ISOLATE_IDLE_TIMEOUT_MS=300000         # Idle cleanup timeout (5 minutes)
FUNCTION_TIMEOUT_MS=30000              # Max execution time (30 seconds)
ENABLE_MODULE_CACHE=true               # Enable module caching
MODULE_CACHE_MAX_SIZE=1000             # Max cached modules (LRU)
```

## Migration Guide

### 1. Install Dependencies

```bash
cd invoke-execution
npm install
```

This will install:
- `isolated-vm@^4.7.0`
- `sandbox-fs@^1.0.0`

And remove:
- `vm2` (deleted from package.json)

### 2. Update Environment Variables

Copy the new configuration from `.env.example`:

```bash
# Add to your .env file
ISOLATE_POOL_SIZE=5
ISOLATE_MAX_POOL_SIZE=20
ISOLATE_MEMORY_LIMIT_MB=128
ISOLATE_IDLE_TIMEOUT_MS=300000
FUNCTION_TIMEOUT_MS=30000
ENABLE_MODULE_CACHE=true
MODULE_CACHE_MAX_SIZE=1000
```

### 3. Start the Service

```bash
npm start
```

You should see:
```
🚀 Initializing execution engine...
[IsolatePool] Initializing pool (size: 5, max: 20)...
[IsolatePool] Warming up pool with 5 isolates...
[IsolatePool] Warm-up complete: 5/5 isolates ready
✅ Execution engine initialized
⚡ Invoke Execution Service running on port 3001
🏊 Isolate Pool: 5 base, 20 max
💾 Memory Limit: 128MB per isolate
⏱️ Function Timeout: 30000ms
📦 Module Cache: Enabled (max 1000)
```

### 4. Verify Metrics

```bash
curl http://localhost:3001/metrics
```

Expected response:
```json
{
  "isolatePool": {
    "total": 5,
    "available": 5,
    "active": 0,
    "corrupted": 0,
    "created": 5,
    "destroyed": 0
  },
  "moduleCache": {
    "size": 0,
    "hits": 0,
    "misses": 0,
    "evictions": 0,
    "hitRate": 0
  }
}
```

## User Function Contract

**No changes required for user functions!**

User functions continue to use the same Express-style handler pattern:

```javascript
// Synchronous handler
module.exports = function(req, res) {
    res.json({ message: 'Hello World' });
};

// Async handler
module.exports = async function(req, res) {
    const data = await fetchData();
    res.json(data);
};
```

### Available APIs

User functions have access to:

1. **Request Object** (`req`):
   - `req.method`, `req.url`, `req.path`
   - `req.body`, `req.query`, `req.params`
   - `req.headers`, `req.get(name)`
   - `req.ip`, `req.hostname`, `req.protocol`

2. **Response Object** (`res`):
   - `res.json(data)`, `res.send(data)`
   - `res.status(code)`, `res.setHeader(name, value)`

3. **Console**:
   - `console.log()`, `console.info()`, `console.warn()`, `console.error()`

4. **Filesystem** (read-only, scoped to package):
   - `fs.readFileSync()`, `fs.readFile()`
   - `fs.readdirSync()`, `fs.readdir()`
   - `fs.statSync()`, `fs.stat()`
   - All other `fs` methods

5. **Built-in Modules**:
   - `require('path')`
   - `require('buffer')`
   - `require('util')`
   - Relative imports: `require('./utils.js')`

6. **Globals**:
   - `Buffer`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`
   - `process.env` (populated from database)

## Performance Improvements

### 1. **Isolate Pooling**
- Pre-warmed isolates eliminate cold start overhead
- Reuse reduces memory allocation and GC pressure
- Dynamic scaling handles burst traffic

### 2. **Module Caching**
- Compiled modules cached across executions
- Cache key includes `package_hash` for version safety
- LRU eviction prevents unbounded growth

### 3. **Bootstrap Script Caching**
- Bootstrap code pre-compiled once at startup
- Reused for all isolates and executions

### 4. **Async Warm-up**
- Pool initialization non-blocking
- Service starts immediately, pool warms in background

## Security Improvements

### 1. **True Isolation**
- Each function runs in separate V8 isolate
- Cannot access other function's memory or state
- Memory limits enforced at V8 level

### 2. **Read-Only Filesystem**
- All file operations restricted to package directory
- No write access (enforced by sandbox-fs)
- Path traversal prevented automatically

### 3. **Timeout Enforcement**
- Execution timeouts enforced at isolate level
- Timeout triggers isolate replacement (prevents corruption)

### 4. **Error Sanitization Removed**
- Errors now returned as-is for better debugging
- Stack traces include original file paths

## Troubleshooting

### Issue: `npm install` fails for isolated-vm

**Cause**: isolated-vm requires compilation (C++ bindings)

**Solution**:
1. Ensure Node.js 18+ installed
2. Install build tools:
   - Windows: `npm install --global windows-build-tools`
   - Linux: `sudo apt-get install build-essential`
   - macOS: `xcode-select --install`

### Issue: Isolate pool not warming up

**Symptom**: "Initializing execution engine..." hangs

**Solution**:
1. Check logs for compilation errors
2. Verify `ISOLATE_POOL_SIZE` is valid number
3. Check memory limits are reasonable

### Issue: Module not found errors

**Symptom**: `Error: Cannot find module './utils.js'`

**Solution**:
1. Verify module exists in package
2. Check relative path is correct
3. Ensure module exports using `module.exports`

### Issue: Function timeout

**Symptom**: `Function execution timeout (30000ms)`

**Solution**:
1. Increase `FUNCTION_TIMEOUT_MS` if needed
2. Check for infinite loops in function code
3. Review async operations (ensure promises resolve)

## Rollback Plan

If you need to rollback to vm2:

1. Restore backup:
   ```bash
   cp services/execution.js.backup services/execution.js
   ```

2. Restore package.json:
   ```bash
   npm install vm2@^3.9.19
   npm uninstall isolated-vm sandbox-fs
   ```

3. Remove metrics route from server.js (optional)

4. Restart service

## Files Modified

- ✅ `services/execution.js` - Complete rewrite (backup at `execution.js.backup`)
- ✅ `package.json` - Updated dependencies
- ✅ `server.js` - Added initialization and metrics
- ✅ `.env.example` - Added new configuration

## Files Created

- ✅ `services/isolate-pool.js` - Isolate pool management
- ✅ `services/module-loader.js` - CommonJS module loading
- ✅ `services/fs-bridge.js` - Filesystem API bridge
- ✅ `services/execution-context.js` - Execution lifecycle management
- ✅ `routes/metrics.js` - Metrics endpoint

## Next Steps

1. **Testing**: Test with your existing functions
2. **Monitoring**: Watch metrics endpoint for pool health
3. **Tuning**: Adjust pool sizes and timeouts based on load
4. **Documentation**: Update API docs if needed

## References

- [isolated-vm documentation](https://github.com/laverdet/isolated-vm)
- [sandbox-fs documentation](https://www.npmjs.com/package/sandbox-fs)
- [Original execution.js](services/execution.js.backup)

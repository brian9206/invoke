# Execution Environment Limitations

Understanding the constraints and restrictions of the Invoke sandbox execution environment.

## File System

### Ephemeral File System Access
The sandbox has full read/write access to the file system, but all writes are **ephemeral** — any files created or modified during an invocation are discarded when the invocation ends.

**Available (ephemeral writes):**
- Writing to files: `fs.writeFile()`, `fs.writeFileSync()`
- Creating directories: `fs.mkdir()`, `fs.mkdirSync()`
- Deleting files: `fs.unlink()`, `fs.rmSync()`
- Modifying permissions: `fs.chmod()`
- Reading files: `fs.readFile()`, `fs.readFileSync()`
- Listing directories: `fs.readdir()`
- File stats: `fs.stat()`, `fs.exists()`

**Note:** Ephemeral storage is useful for temporary files within a single invocation (e.g., building a zip in memory, writing intermediary data). For data that must persist across invocations, use the KV Store.

```javascript
import fs from 'fs';

export default async function handler(req, res) {
    // ✅ Works — file exists for this invocation only
    fs.writeFileSync('/tmp/data.txt', 'content');
    const content = fs.readFileSync('/tmp/data.txt', 'utf8');

    // ✅ For persistent data, use KV store
    await kv.set('data', 'content');
}
```

## Network Restrictions

### No Direct Server Binding
Functions cannot create server sockets or bind to ports because it is in sandboxed network.

**Not Available:**
```javascript
// ❌ Cannot create HTTP server
const server = http.createServer();
server.listen(3000);

// ❌ Cannot create TCP server
const server = net.createServer();
server.listen(8080);
```

**Available:**
```javascript
// ✅ Make outbound HTTP requests
const response = await fetch('https://api.example.com/data');
```

### Network Policy Enforcement
Outbound connections are governed by network policies configured in the admin panel.

**Default:** All outbound connections are allowed

**Can be restricted to:**
- Specific domains/IPs
- Certain ports
- Allowed protocols (HTTP, HTTPS, WebSocket)

## Module Restrictions

## Resource Limits

### Execution Timeout
Functions have a maximum execution time.

**Default:** 30 seconds

**Impact:**
- Long-running operations will be terminated
- Use async patterns to handle multiple operations efficiently

```javascript
// ❌ May timeout
await sleep(60000); // 60 seconds

// ✅ Design for quick responses
res.json({ status: 'processing' });
// Queue heavy work for background processing
```

### Memory Limits
Each function execution has limited memory.

**Default:** 256 MB

**Impact:**
- Keep data structures lean
- Stream large responses
- Avoid loading large files entirely into memory

```javascript
// ❌ Memory intensive
const bigArray = new Array(10000000).fill('data');

// ✅ Memory efficient
const data = await kv.get('data');
res.json(data);
```

### CPU Limitations
Functions run in a shared environment with CPU throttling.

**Impact:**
- CPU-intensive operations may be slow
- Keep computations light
- Offload heavy processing to external services

## Timing Restrictions

### No Persistent Timers
Timers do not persist across function invocations.

```javascript
// ❌ This won't work across invocations
setTimeout(() => {
    console.log('This runs only during current invocation');
}, 5000);
```

**Workaround:**
Use the scheduler service for recurring tasks.

### Time-based Operations
Use `Date.now()` or `new Date()` for timestamps. High-resolution timing is limited.

```javascript
// ✅ Available
const now = Date.now();
const date = new Date();

// ⚠️ Limited precision
console.time('operation');
// ... operation
console.timeEnd('operation');
```

## Security Restrictions

### Isolation
Each function runs in an isolated sandbox with no access to:
- Host file system
- Other functions' data
- Shared memory
- System resources

### Environment Variables
Environment variables are read-only and configured per function version.

```javascript
// ✅ Read environment variables
const apiKey = process.env.API_KEY;

// ❌ Cannot modify
process.env.API_KEY = 'new-key'; // No effect
```

### No Reflection
Limited access to sandbox internals and introspection capabilities.

## Global Scope Limitations

### No Global State Persistence
Global variables do not persist between invocations.

```javascript
let counter = 0; // Reset on each invocation

export default function handler(req, res) {
    counter++;
    res.json({ count: counter }); // Always returns 1
}
```

**Workaround:**
```javascript
// ✅ Use KV store for state
export default async function handler(req, res) {
    let counter = await kv.get('counter') || 0;
    counter++;
    await kv.set('counter', counter);
    res.json({ count: counter });
}
```

### Module Caching
Modules are not cached across invocations (unlike standard Node.js).

## Working with Limitations

### Design Patterns

**Stateless Functions:**
```javascript
// ✅ Don't rely on state
export default function handler(req, res) {
    const result = processRequest(req.body);
    res.json(result);
}
```

**External State:**
```javascript
// ✅ Use KV store for state
export default async function handler(req, res) {
    const state = await kv.get('state');
    const newState = updateState(state, req.body);
    await kv.set('state', newState);
    res.json(newState);
}
```

**API-First:**
```javascript
// ✅ Use external services for heavy work
const result = await fetch('https://api.service.com/process', {
    method: 'POST',
    body: JSON.stringify(req.body)
});
```

**Stream Large Data:**
```javascript
// ✅ Stream responses
res.type('application/json');
res.write('[');
for await (const item of getItems()) {
    res.write(JSON.stringify(item) + ',');
}
res.write(']');
res.end();
```

## Next Steps

- [Best Practices](/docs/advanced/best-practices) - Recommended patterns
- [KV Store API](/docs/api/kv-store) - State management
- [Global APIs](/docs/api/globals) - Available APIs

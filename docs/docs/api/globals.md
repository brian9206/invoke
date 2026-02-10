# Global APIs

Invoke provides several global objects and functions that are available in all functions without requiring any modules.

## Console

Full console API for logging:

```javascript
module.exports = function(req, res) {
    console.log('Info message');
    console.error('Error message');
    console.warn('Warning message');
    console.debug('Debug message');
    console.info('Info message');
    
    // Timing
    console.time('operation');
    // ... some code ...
    console.timeEnd('operation'); // Logs: operation: 123ms
    
    // Counting
    console.count('requests'); // requests: 1
    console.count('requests'); // requests: 2
    console.countReset('requests');
    
    // Tables
    console.table([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
    
    res.send('Check logs');
};
```

**Methods:**
- `log(...args)` - Log general messages
- `info(...args)` - Log info messages
- `warn(...args)` - Log warnings
- `error(...args)` - Log errors  
- `debug(...args)` - Log debug messages
- `time(label)` - Start timer
- `timeEnd(label)` - End timer and log duration
- `count(label)` - Increment counter and log
- `countReset(label)` - Reset counter
- `table(data)` - Log data as table

## Timers

Standard JavaScript timer functions:

### setTimeout / clearTimeout

```javascript
module.exports = function(req, res) {
    const timeoutId = setTimeout(() => {
        console.log('Delayed log');
    }, 1000);
    
    // Cancel if needed
    clearTimeout(timeoutId);
    
    res.send('Timer set');
};
```

### setInterval / clearInterval

```javascript
module.exports = function(req, res) {
    let count = 0;
    const intervalId = setInterval(() => {
        console.log('Count:', ++count);
        if (count >= 5) {
            clearInterval(intervalId);
        }
    }, 100);
    
    res.send('Interval started');
};
```

### setImmediate / clearImmediate

```javascript
module.exports = function(req, res) {
    const immediateId = setImmediate(() => {
        console.log('Immediate execution');
    });
    
    // Cancel if needed
    clearImmediate(immediateId);
    
    res.send('Immediate set');
};
```

### sleep() - Invoke-specific

Promise-based sleep function:

```javascript
module.exports = async function(req, res) {
    console.log('Start');
    await sleep(1000); // Sleep for 1 second
    console.log('After 1 second');
    await sleep(2000); // Sleep for 2 more seconds
    console.log('After 3 seconds total');
    
    res.json({ completed: true });
};
```

## Fetch API

Modern fetch API for HTTP requests (no require needed):

```javascript
module.exports = async function(req, res) {
    // Simple GET request
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    
    // POST with JSON
    const postResponse = await fetch('https://api.example.com/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Alice' })
    });
    
    // With headers
    const authResponse = await fetch('https://api.example.com/protected', {
        headers: {
            'Authorization': 'Bearer token123'
        }
    });
    
    res.json({ success: true });
};
```

### Headers Class

```javascript
module.exports = function(req, res) {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', 'Bearer token');
    
    res.json({
        contentType: headers.get('Content-Type'),
        has: headers.has('Authorization')
    });
};
```

### Request Class

```javascript
module.exports = async function(req, res) {
    const request = new Request('https://api.example.com/data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: 'value' })
    });
    
    const response = await fetch(request);
    const data = await response.json();
    
    res.json(data);
};
```

### Response Class

Returned by `fetch()`:

```javascript
module.exports = async function(req, res) {
    const response = await fetch('https://api.example.com/data');
    
    console.log(response.status);        // 200
    console.log(response.statusText);    // 'OK'
    console.log(response.ok);            // true
    console.log(response.headers);       // Headers object
    console.log(response.url);           // Final URL after redirects
    
    // Parse response body
    const json = await response.json();     // Parse as JSON
    // const text = await response.text();  // Parse as text
    // const buffer = await response.buffer(); // Get as Buffer
    
    res.json(json);
};
```

## Buffer

Binary data handling:

```javascript
module.exports = function(req, res) {
    // Create buffers
    const buf1 = Buffer.from('Hello', 'utf8');
    const buf2 = Buffer.from([0x48, 0x69]); // 'Hi'
    const buf3 = Buffer.alloc(10); // 10 zero bytes
    const buf4 = Buffer.allocUnsafe(10); // Uninitialized
    
    // Convert to string
    const str = buf1.toString('utf8');
    const hex = buf1.toString('hex');
    const base64 = buf1.toString('base64');
    
    // Manipulate
    const combined = Buffer.concat([buf1, buf2]);
    const slice = buf1.slice(0, 3);
    
    res.json({
        str, hex, base64,
        length: combined.length
    });
};
```

**Common methods:**
- `Buffer.from(value, encoding)` - Create from string/array
- `Buffer.alloc(size)` - Create initialized buffer
- `Buffer.concat(buffers)` - Combine buffers
- `toString(encoding)` - Convert to string
- `slice(start, end)` - Extract portion
- `copy(target)` - Copy to another buffer

## Process

Limited process information (read-only):

```javascript
module.exports = function(req, res) {
    res.json({
        // Environment variables (read-only)
        env: process.env,
        
        // System info
        platform: process.platform,    // 'linux', 'win32', etc.
        arch: process.arch,            // 'x64', 'arm', etc.
        version: process.version,      // Node.js version
        versions: process.versions,    // Component versions
        
        // Process info
        cwd: process.cwd(),           // Always '/app'
        argv: process.argv,           // Command line args
        pid: process.pid,             // Process ID
        
        // Timing
        uptime: process.uptime(),     // Process uptime in seconds
        hrtime: process.hrtime(),     // High-resolution time
        
        // Memory
        memoryUsage: process.memoryUsage()
    });
};
```

**Available properties/methods:**
- `process.env` - Environment variables (read-only)
- `process.cwd()` - Current working directory (always `/app`)
- `process.platform` - Operating system
- `process.arch` - CPU architecture
- `process.version` - Node.js version
- `process.versions` - Component versions
- `process.argv` - Command line arguments
- `process.memoryUsage()` - Memory statistics
- `process.hrtime()` - High-resolution time
- `process.nextTick(callback)` - Schedule callback
- `process.uptime()` - Process uptime

**Restricted methods:**
- `process.exit()` - Throws EACCES
- `process.kill()` - Throws EACCES
- Writing to `process.env` - No effect (read-only)

## Text Encoding

### TextEncoder

```javascript
module.exports = function(req, res) {
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode('Hello, 世界');
    
    res.json({
        bytes: Array.from(uint8Array),
        length: uint8Array.length
    });
};
```

### TextDecoder

```javascript
module.exports = function(req, res) {
    const decoder = new TextDecoder('utf-8');
    const uint8Array = new Uint8Array([72, 101, 108, 108, 111]);
    const text = decoder.decode(uint8Array);
    
    res.json({ text }); // { text: 'Hello' }
};
```

## Event Emitter

Event emitter pattern:

```javascript
const EventEmitter = require('events');

module.exports = function(req, res) {
    const emitter = new EventEmitter();
    
    // Subscribe to event
    emitter.on('data', (value) => {
        console.log('Received:', value);
    });
    
    // Emit events
    emitter.emit('data', 42);
    emitter.emit('data', 'Hello');
    
    res.send('Events emitted');
};
```

## DOM-Style Events

Modern event system with `EventTarget`:

### Event & CustomEvent

```javascript
module.exports = function(req, res) {
    const event = new Event('click');
    const customEvent = new CustomEvent('custom', {
        detail: { key: 'value' }
    });
    
    res.json({
        type: event.type,
        customDetail: customEvent.detail
    });
};
```

### EventTarget

```javascript
module.exports = function(req, res) {
    const target = new EventTarget();
    
    // Add listener
    target.addEventListener('message', (event) => {
        console.log('Message:', event.detail);
    });
    
    // Dispatch event
    const event = new CustomEvent('message', {
        detail: { text: 'Hello' }
    });
    target.dispatchEvent(event);
    
    res.send('Event dispatched');
};
```

### AbortController & AbortSignal

Control async operations:

```javascript
module.exports = async function(req, res) {
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Abort after 5 seconds
    setTimeout(() => controller.abort(), 5000);
    
    try {
        const response = await fetch('https://api.example.com/data', {
            signal
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            res.status(408).json({ error: 'Request timeout' });
        } else {
            throw error;
        }
    }
};
```

## require()

CommonJS module system:

```javascript
module.exports = function(req, res) {
    // Built-in modules
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    
    // Local modules
    const utils = require('./lib/utils');
    
    // npm packages (from node_modules)
    const lodash = require('lodash');
    
    // JSON files
    const config = require('./config.json');
    
    res.json({ loaded: true });
};
```

**Module resolution:**
1. Core modules (`crypto`, `fs`, etc.)
2. Relative paths (`./utils.js`, `../lib/helper.js`)
3. node_modules lookup
4. JSON files

## Next Steps

- [Request Object](/docs/api/request) - HTTP request API
- [Response Object](/docs/api/response) - HTTP response API
- [KV Store](/docs/api/kv-store) - Persistent storage
- [Modules](/docs/api/modules/assert) - All available modules

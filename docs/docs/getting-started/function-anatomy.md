# Function Anatomy

Learn about the structure and components of an Invoke function.

## Basic Structure

Every Invoke function follows this pattern:

```javascript
module.exports = function(req, res) {
    // Your code here
    res.send('Response');
};
```

## Export Formats

### Standard Function

```javascript
module.exports = function(req, res) {
    res.json({ message: 'Hello' });
};
```

### Arrow Function

```javascript
module.exports = (req, res) => {
    res.json({ message: 'Hello' });
};
```

### Async Function

```javascript
module.exports = async function(req, res) {
    const data = await fetch('https://api.example.com/data');
    const json = await data.json();
    res.json(json);
};
```

### Async Arrow Function

```javascript
module.exports = async (req, res) => {
    const result = await someAsyncOperation();
    res.json(result);
};
```

## Function Parameters

### Request Object (`req`)

The request object contains information about the incoming HTTP request:

```javascript
module.exports = function(req, res) {
    console.log(req.method);       // 'GET', 'POST', etc.
    console.log(req.path);         // '/some/path'
    console.log(req.query);        // { key: 'value' }
    console.log(req.body);         // Parsed JSON/form data
    console.log(req.headers);      // Request headers
    console.log(req.cookies);      // Parsed cookies
};
```

See the [Request API](/docs/api/request) for complete documentation.

### Response Object (`res`)

The response object is used to send data back to the client:

```javascript
module.exports = function(req, res) {
    // Send JSON
    res.json({ success: true });
    
    // Send text
    res.send('Hello World');
    
    // Set status code
    res.status(201).json({ created: true });
    
    // Send file
    res.sendFile('/path/to/file.pdf');
};
```

See the [Response API](/docs/api/response) for complete documentation.

## Using Modules

Invoke provides 24 built-in Node.js-compatible modules:

```javascript
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function(req, res) {
    // Use crypto module
    const hash = crypto.createHash('sha256')
        .update('data')
        .digest('hex');
    
    // Read a file
    const content = fs.readFileSync(
        path.join(__dirname, 'data.txt'),
        'utf8'
    );
    
    res.json({ hash, content });
};
```

Available modules: `assert`, `buffer`, `console`, `crypto`, `dns`, `events`, `fs`, `http`, `https`, `mime-types`, `net`, `node-fetch`, `path`, `process`, `punycode`, `stream`, `string_decoder`, `timers`, `tls`, `url`, `util`, `ws`, `zlib`, and `_eventtarget`.

See [API Reference](/docs/api/modules/assert) for details on each module.

## Global Variables

Several globals are available without requiring:

### Console Logging

```javascript
module.exports = function(req, res) {
    console.log('Info message');
    console.error('Error message');
    console.warn('Warning message');
    
    res.send('Check logs');
};
```

### Timers

```javascript
module.exports = async function(req, res) {
    // Promise-based sleep (Invoke-specific)
    await sleep(1000); // Sleep for 1 second
    
    // Standard timers
    setTimeout(() => {
        console.log('Delayed log');
    }, 500);
    
    res.json({ delayed: true });
};
```

### Fetch API

```javascript
module.exports = async function(req, res) {
    // Global fetch (no require needed)
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    
    res.json(data);
};
```

### KV Store

```javascript
module.exports = async function(req, res) {
    // Global kv store (no require needed)
    await kv.set('counter', 42);
    const value = await kv.get('counter');
    
    res.json({ counter: value });
};
```

See [Globals API](/docs/api/globals) for complete documentation.

## Package Structure

A function package is a zip file containing:

```
function.zip
├── index.js           # Entry point (required)
├── package.json       # Package metadata (required)
├── node_modules/      # Dependencies (optional)
│   └── lodash/
├── data/              # Data files (optional)
│   └── config.json
└── lib/               # Helper modules (optional)
    └── utils.js
```

### package.json Example

```json
{
  "name": "my-function",
  "version": "1.0.0",
  "description": "My Invoke function",
  "main": "index.js",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}
```

### Using Local Modules

```javascript
// lib/utils.js
module.exports = {
    formatDate(date) {
        return date.toISOString();
    }
};

// index.js
const utils = require('./lib/utils');

module.exports = function(req, res) {
    const formatted = utils.formatDate(new Date());
    res.json({ date: formatted });
};
```

### Using npm Packages

```javascript
// Include lodash in node_modules
const _ = require('lodash');

module.exports = function(req, res) {
    const data = [1, 2, 3, 4, 5];
    const doubled = _.map(data, n => n * 2);
    
    res.json({ result: doubled });
};
```

## Error Handling

Always handle errors gracefully:

```javascript
module.exports = async function(req, res) {
    try {
        const response = await fetch('https://api.example.com/data');
        
        if (!response.ok) {
            return res.status(response.status).json({
                error: 'External API error'
            });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Function error:', error);
        res.status(500).json({
            error: 'Internal error',
            message: error.message
        });
    }
};
```

## Synchronous vs Asynchronous

### Synchronous Function

Immediately sends response:

```javascript
module.exports = function(req, res) {
    const result = computeSync();
    res.json(result);
};
```

### Asynchronous Function

Awaits promises before responding:

```javascript
module.exports = async function(req, res) {
    const data = await fetchData();
    const processed = await processData(data);
    res.json(processed);
};
```

**Important**: Always send exactly one response. Don't call `res.send()`, `res.json()`, etc. multiple times in the same function.

## Next Steps

- [Deploying Functions](/docs/getting-started/deploying) - Learn deployment options
- [API Reference](/docs/api/globals) - Explore available APIs
- [Examples](/docs/examples/hello-world) - See real-world examples

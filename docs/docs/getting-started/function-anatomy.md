# Function Anatomy

Learn about the structure and components of an Invoke function.

## Basic Structure

Every Invoke function follows this pattern:

```javascript
export default function handler(req, res) {
    // Your code here
    res.send('Response');
}
```

## Export Formats

### Standard Function

```javascript
export default function handler(req, res) {
    res.json({ message: 'Hello' });
}
```

### Arrow Function

```javascript
export default (req, res) => {
    res.json({ message: 'Hello' });
};
```

### Async Function

```javascript
export default async function handler(req, res) {
    const data = await fetch('https://api.example.com/data');
    const json = await data.json();
    res.json(json);
}
```

### Async Arrow Function

```javascript
export default async (req, res) => {
    const result = await someAsyncOperation();
    res.json(result);
};
```

### Router

For functions that handle multiple routes, you can export a `Router` instance. `Router` is a globally available class — no `require()` needed.

```javascript
const router = new Router();

router.get('/', (req, res) => {
    res.json({ message: 'Hello' });
});

router.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id });
});

router.post('/users', async (req, res) => {
    const user = await createUser(req.body);
    res.status(201).json(user);
});

// Optional: catch unmatched routes
router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

export default router;
```

See the [Router API](/docs/api/router) for complete documentation.

## Function Parameters

### Request Object (`req`)

The request object contains information about the incoming HTTP request:

```javascript
export default function handler(req, res) {
    console.log(req.method);       // 'GET', 'POST', etc.
    console.log(req.path);         // '/some/path'
    console.log(req.query);        // { key: 'value' }
    console.log(req.body);         // Parsed JSON/form data
    console.log(req.headers);      // Request headers
    console.log(req.cookies);      // Parsed cookies
}
```

See the [Request API](/docs/api/request) for complete documentation.

### Response Object (`res`)

The response object is used to send data back to the client:

```javascript
export default function handler(req, res) {
    // Send JSON
    res.json({ success: true });
    
    // Send text
    res.send('Hello World');
    
    // Set status code
    res.status(201).json({ created: true });
    
    // Send file
    res.sendFile('/path/to/file.pdf');
}
```

See the [Response API](/docs/api/response) for complete documentation.

## Using Modules

Standard Node.js-compatible modules are available in the sandbox environment:

```javascript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
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
}
```

Standard Node.js-compatible modules are available in the sandbox environment, including `crypto`, `fs`, `path`, `http`, `https`, `dns`, `zlib`, `stream`, `url`, `util`, `events`, `buffer`, `assert`, `timers`, `tls`, `net`, and more.

## Global Variables

Several globals are available without requiring:

### Console Logging

```javascript
export default function handler(req, res) {
    console.log('Info message');
    console.error('Error message');
    console.warn('Warning message');
    
    res.send('Check logs');
}
```

### Timers

```javascript
export default async function handler(req, res) {
    // Promise-based sleep (Invoke-specific)
    await sleep(1000); // Sleep for 1 second
    
    // Standard timers
    setTimeout(() => {
        console.log('Delayed log');
    }, 500);
    
    res.json({ delayed: true });
}
```

### Fetch API

```javascript
export default async function handler(req, res) {
    // Global fetch (no require needed)
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    
    res.json(data);
}
```

### KV Store

```javascript
export default async function handler(req, res) {
    // Global kv store (no require needed)
    await kv.set('counter', 42);
    const value = await kv.get('counter');
    
    res.json({ counter: value });
}
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
export default {
    formatDate(date) {
        return date.toISOString();
    }
};

// index.js
import utils from './lib/utils.js';

export default function handler(req, res) {
    const formatted = utils.formatDate(new Date());
    res.json({ date: formatted });
}
```

### Using npm Packages

```javascript
// Include lodash in node_modules
import _ from 'lodash';

export default function handler(req, res) {
    const data = [1, 2, 3, 4, 5];
    const doubled = _.map(data, n => n * 2);
    
    res.json({ result: doubled });
}
```

## Error Handling

Always handle errors gracefully:

```javascript
export default async function handler(req, res) {
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
}
```

## Synchronous vs Asynchronous

### Synchronous Function

Immediately sends response:

```javascript
export default function handler(req, res) {
    const result = computeSync();
    res.json(result);
}
```

### Asynchronous Function

Awaits promises before responding:

```javascript
export default async function handler(req, res) {
    const data = await fetchData();
    const processed = await processData(data);
    res.json(processed);
}
```

**Important**: Always send exactly one response. Don't call `res.send()`, `res.json()`, etc. multiple times in the same function.

## Next Steps

- [Deploying Functions](/docs/getting-started/deploying) - Learn deployment options
- [API Reference](/docs/api/globals) - Explore available APIs
- [Examples](/docs/examples/hello-world) - See real-world examples

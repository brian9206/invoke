# Debugging

Troubleshooting and resolving issues in Invoke functions.

## Console Logging

### Basic Logging
Use `console.log()` to output debug information.

```javascript
module.exports = async function(req, res) {
    console.log('Function invoked');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Body:', req.body);
    
    const result = await processRequest(req.body);
    console.log('Result:', result);
    
    res.json(result);
};
```

### Structured Logging
Log in JSON format for easier parsing.

```javascript
function log(level, message, data = {}) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data
    }));
}

module.exports = async function(req, res) {
    log('info', 'Request received', {
        method: req.method,
        path: req.path
    });
    
    try {
        const result = await processRequest(req.body);
        log('info', 'Request processed successfully', { result });
        res.json(result);
    } catch (error) {
        log('error', 'Request failed', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message });
    }
};
```

### Log Levels
Implement different log levels.

```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level) {
    return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function log(level, message, data) {
    if (shouldLog(level)) {
        console.log(JSON.stringify({ level, message, ...data }));
    }
}

module.exports = async function(req, res) {
    log('debug', 'Debug info', { query: req.query });
    log('info', 'Processing request', { path: req.path });
    
    res.json({ success: true });
};
```

## Error Handling

### Try-Catch Blocks
Always wrap async operations.

```javascript
module.exports = async function(req, res) {
    try {
        const data = await fetch('https://api.example.com/data');
        const json = await data.json();
        res.json(json);
    } catch (error) {
        console.error('Fetch failed:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            error: 'Failed to fetch data',
            message: error.message
        });
    }
};
```

### Error Context
Include helpful context in errors.

```javascript
async function fetchUser(userId) {
    try {
        const response = await fetch(`https://api.example.com/users/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch user:', {
            userId,
            error: error.message,
            url: `https://api.example.com/users/${userId}`
        });
        throw error;
    }
}

module.exports = async function(req, res) {
    const userId = req.params.userId;
    
    try {
        const user = await fetchUser(userId);
        res.json({ user });
    } catch (error) {
        res.status(500).json({
            error: 'User fetch failed',
            userId,
            details: error.message
        });
    }
};
```

### Error Types
Create custom error types for better handling.

```javascript
class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}

module.exports = async function(req, res) {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            throw new ValidationError('Invalid email format', 'email');
        }
        
        const user = await findUser(email);
        if (!user) {
            throw new NotFoundError(`User not found: ${email}`);
        }
        
        res.json({ user });
        
    } catch (error) {
        console.error('Error:', error);
        
        if (error instanceof ValidationError) {
            return res.status(400).json({
                error: 'Validation failed',
                field: error.field,
                message: error.message
            });
        }
        
        if (error instanceof NotFoundError) {
            return res.status(404).json({
                error: 'Not found',
                message: error.message
            });
        }
        
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
```

## Request Inspection

### Debug Request Details
Log all request information.

```javascript
module.exports = function(req, res) {
    const debug = {
        method: req.method,
        path: req.path,
        query: req.query,
        params: req.params,
        headers: req.headers,
        body: req.body,
        cookies: req.cookies,
        ip: req.ip,
        ips: req.ips,
        protocol: req.protocol,
        secure: req.secure,
        xhr: req.xhr
    };
    
    console.log('Request debug info:', JSON.stringify(debug, null, 2));
    
    res.json({ debug });
};
```

### Test Endpoint
Create a debug endpoint for testing.

```javascript
module.exports = function(req, res) {
    if (req.path === '/debug') {
        return res.json({
            request: {
                method: req.method,
                path: req.path,
                query: req.query,
                headers: req.headers,
                body: req.body
            },
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                cwd: process.cwd(),
                env: Object.keys(process.env)
            },
            timestamp: new Date().toISOString()
        });
    }
    
    // Normal function logic
    res.json({ message: 'Hello World' });
};
```

## Common Issues

### Issue: Function Times Out

**Symptoms:**
- No response after 30 seconds
- Request appears to hang

**Causes:**
- Long-running synchronous operations
- Waiting for external service that doesn't respond
- Infinite loops

**Solutions:**

```javascript
// ❌ Will timeout
module.exports = async function(req, res) {
    await sleep(60000); // 60 seconds - exceeds timeout
    res.json({ done: true });
};

// ✅ Complete within timeout
module.exports = async function(req, res) {
    // Queue work and respond immediately
    await kv.set(`job:${crypto.randomUUID()}`, req.body);
    res.status(202).json({ 
        status: 'queued',
        message: 'Processing will complete in background'
    });
};

// ✅ Add timeout to external requests
module.exports = async function(req, res) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
        const response = await fetch('https://api.example.com/data', {
            signal: controller.signal
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            res.status(504).json({ error: 'Request timeout' });
        } else {
            res.status(500).json({ error: error.message });
        }
    } finally {
        clearTimeout(timeout);
    }
};
```

### Issue: Memory Errors

**Symptoms:**
- Function crashes with out of memory error
- Slow performance with large datasets

**Causes:**
- Loading large files into memory
- Creating large arrays or objects
- Memory leaks

**Solutions:**

```javascript
// ❌ Memory intensive
module.exports = async function(req, res) {
    const bigArray = new Array(10000000).fill({ data: 'value' });
    res.json(bigArray);
};

// ✅ Stream response
module.exports = async function(req, res) {
    res.type('application/json');
    res.write('[');
    
    for (let i = 0; i < 1000; i++) {
        if (i > 0) res.write(',');
        res.write(JSON.stringify({ id: i, data: 'value' }));
    }
    
    res.write(']');
    res.end();
};

// ✅ Paginate data
module.exports = async function(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;
    
    const items = await getItems(offset, limit);
    res.json({ items, page, hasMore: items.length === limit });
};
```

### Issue: Network Request Fails

**Symptoms:**
- Fetch throws error
- Cannot connect to external API

**Causes:**
- Network policy restrictions
- Invalid URL or endpoint
- SSL/TLS certificate issues
- API rate limiting

**Solutions:**

```javascript
module.exports = async function(req, res) {
    try {
        const response = await fetch('https://api.example.com/data', {
            method: 'GET',
            headers: {
                'User-Agent': 'Invoke-Function',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        res.json(data);
        
    } catch (error) {
        console.error('Network request failed:', {
            error: error.message,
            stack: error.stack,
            url: 'https://api.example.com/data'
        });
        
        // Check if it's a network policy issue
        if (error.message.includes('fetch') || error.message.includes('network')) {
            return res.status(502).json({
                error: 'Network request failed',
                message: 'Check network policies in admin panel',
                details: error.message
            });
        }
        
        res.status(500).json({
            error: 'Request failed',
            message: error.message
        });
    }
};
```

### Issue: KV Store Not Working

**Symptoms:**
- `kv.get()` returns unexpected values
- `kv.set()` doesn't persist data

**Causes:**
- TTL expired
- Key naming conflicts
- Not awaiting promises

**Solutions:**

```javascript
// ❌ Not awaiting
module.exports = function(req, res) {
    kv.set('key', 'value'); // Missing await
    const value = kv.get('key'); // Missing await
    res.json({ value }); // Will be undefined/promise
};

// ✅ Proper async/await
module.exports = async function(req, res) {
    await kv.set('key', 'value');
    const value = await kv.get('key');
    res.json({ value }); // Correct value
};

// ✅ Check TTL
module.exports = async function(req, res) {
    // Set with 1 hour TTL
    await kv.set('session', { user: 'alice' }, 3600);
    
    // Check if exists
    const exists = await kv.has('session');
    console.log('Session exists:', exists);
    
    const session = await kv.get('session');
    res.json({ session, exists });
};

// ✅ Debug key names
module.exports = async function(req, res) {
    const key = `user:${req.params.id}`;
    console.log('Using key:', key);
    
    await kv.set(key, { name: 'Alice' });
    const user = await kv.get(key);
    
    console.log('Retrieved user:', user);
    res.json({ user });
};
```

## Testing Tips

### Use curl for Testing

```bash
# GET request
curl http://localhost:3001/execute/{projectId}/function

# POST with JSON
curl -X POST http://localhost:3001/execute/{projectId}/function \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# With headers
curl http://localhost:3001/execute/{projectId}/function \
  -H "Authorization: Bearer token" \
  -H "Custom-Header: value"

# With query params
curl "http://localhost:3001/execute/{projectId}/function?param1=value1&param2=value2"
```

### Test Different Scenarios

```javascript
module.exports = async function(req, res) {
    // Debug mode via query param
    if (req.query.debug === 'true') {
        console.log('DEBUG MODE');
        console.log('Request:', JSON.stringify(req.body, null, 2));
    }
    
    // Test error handling
    if (req.query.testError === 'true') {
        throw new Error('Test error');
    }
    
    // Test timeout
    if (req.query.testTimeout === 'true') {
        await sleep(35000); // Beyond timeout
    }
    
    // Normal operation
    res.json({ success: true });
};
```

### Check Response Headers

```javascript
module.exports = function(req, res) {
    // Log response headers being set
    res.set('Custom-Header', 'value');
    console.log('Response headers:', res.getHeaders());
    
    res.json({ message: 'Check headers' });
};
```

## Next Steps

- [Best Practices](/docs/advanced/best-practices) - Prevent common issues
- [Limitations](/docs/advanced/limitations) - Understand constraints
- [Examples](/docs/examples/hello-world) - Working code samples

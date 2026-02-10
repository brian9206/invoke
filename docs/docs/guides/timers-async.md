# Timers & Async Operations Guide

Learn how to use timers and asynchronous operations in your Invoke functions.

## setTimeout

Execute code after a delay:

```javascript
module.exports = function(req, res) {
    console.log('Start');
    
    setTimeout(() => {
        console.log('Executed after 2 seconds');
    }, 2000);
    
    res.send('Timer set');
};
```

### With Async/Await

```javascript
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function(req, res) {
    console.log('Start');
    await delay(2000);
    console.log('After 2 seconds');
    
    res.send('Done');
};
```

## setInterval

Execute code repeatedly at intervals:

```javascript
module.exports = function(req, res) {
    let count = 0;
    
    const interval = setInterval(() => {
        count++;
        console.log('Count:', count);
        
        if (count >= 5) {
            clearInterval(interval);
            res.send('Completed 5 iterations');
        }
    }, 1000);
};
```

## setImmediate

Execute on next event loop tick:

```javascript
module.exports = function(req, res) {
    console.log('1');
    
    setImmediate(() => {
        console.log('3 - Immediate');
    });
    
    console.log('2');
    
    // Output: 1, 2, 3 - Immediate
    res.send('Done');
};
```

## sleep() - Invoke-Specific

Promise-based sleep function:

```javascript
module.exports = async function(req, res) {
    console.log('Start:', new Date().toISOString());
    
    await sleep(1000);
    console.log('After 1 second');
    
    await sleep(2000);
    console.log('After 3 seconds total');
    
    res.json({
        message: 'Completed',
        timestamp: new Date().toISOString()
    });
};
```

## Timers/Promises API

Modern promise-based timers:

```javascript
const { setTimeout, setInterval } = require('timers/promises');

module.exports = async function(req, res) {
    // Promise-based setTimeout
    await setTimeout(1000);
    console.log('After 1 second');
    
    // With value
    const result = await setTimeout(1000, 'delayed value');
    console.log(result); // 'delayed value'
    
    res.send('Done');
};
```

### Async Interval

```javascript
const { setInterval } = require('timers/promises');

module.exports = async function(req, res) {
    const messages = [];
    let count = 0;
    
    for await (const startTime of setInterval(1000, Date.now())) {
        messages.push(`Tick ${++count} at ${new Date().toISOString()}`);
        
        if (count >= 5) {
            break;
        }
    }
    
    res.json({ messages });
};
```

## AbortController with Timers

Cancel timers using AbortController:

```javascript
const { setTimeout } = require('timers/promises');

module.exports = async function(req, res) {
    const controller = new AbortController();
    
    // Cancel after 3 seconds
    setTimeout(3000).then(() => controller.abort());
    
    try {
        await setTimeout(10000, 'completed', {
            signal: controller.signal
        });
        res.send('Completed 10 seconds');
    } catch (error) {
        if (error.name === 'AbortError') {
            res.send('Cancelled after 3 seconds');
        } else {
            throw error;
        }
    }
};
```

## Common Patterns

### Retry with Exponential Backoff

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.json();
            
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000;
                console.log(`Retry ${i + 1} after ${delay}ms`);
                await sleep(delay);
            }
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await sleep(Math.pow(2, i) * 1000);
        }
    }
}

module.exports = async function(req, res) {
    const data = await fetchWithRetry('https://api.example.com/data');
    res.json(data);
};
```

### Timeout Wrapper

```javascript
async function withTimeout(promise, ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    
    try {
        const result = await promise;
        clearTimeout(timeout);
        return result;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

module.exports = async function(req, res) {
    try {
        const data = await withTimeout(
            fetch('https://api.example.com/slow').then(r => r.json()),
            5000
        );
        res.json(data);
    } catch (error) {
        res.status(408).json({ error: 'Request timeout' });
    }
};
```

### Debounce

```javascript
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

module.exports = async function(req, res) {
    const processRequest = debounce(async (data) => {
        console.log('Processing:', data);
        await kv.set('last:request', data);
    }, 1000);
    
    processRequest(req.body);
    
    res.send('Request queued');
};
```

### Throttle

```javascript
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

module.exports = function(req, res) {
    const logRequest = throttle(() => {
        console.log('Request logged at', new Date().toISOString());
    }, 5000);
    
    logRequest();
    
    res.send('OK');
};
```

### Polling

```javascript
async function poll(fn, validate, interval = 1000, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const result = await fn();
        if (validate(result)) {
            return result;
        }
        await sleep(interval);
    }
    throw new Error('Max polling attempts exceeded');
}

module.exports = async function(req, res) {
    try {
        const result = await poll(
            () => fetch('https://api.example.com/job/123').then(r => r.json()),
            (data) => data.status === 'completed',
            2000, // Check every 2 seconds
            15    // Max 30 seconds
        );
        
        res.json(result);
    } catch (error) {
        res.status(408).json({ error: 'Job did not complete in time' });
    }
};
```

### Rate Limiting with Timers

```javascript
module.exports = async function(req, res) {
    const clientId = req.headers['x-client-id'] || 'anonymous';
    const key = `ratelimit:${clientId}`;
    
    const requests = await kv.get(key) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old requests
    const recentRequests = requests.filter(time => time > oneMinuteAgo);
    
    if (recentRequests.length >= 10) {
        const oldestRequest = recentRequests[0];
        const resetTime = new Date(oldestRequest + 60000).toISOString();
        
        return res.status(429).json({
            error: 'Rate limit exceeded',
            resetAt: resetTime
        });
    }
    
    // Add current request
    recentRequests.push(now);
    await kv.set(key, recentRequests, 60000);
    
    res.json({ success: true });
};
```

## Best Practices

### 1. Clean Up Timers

```javascript
// ✅ Always clear timers
const timeout = setTimeout(() => {}, 5000);
clearTimeout(timeout);

const interval = setInterval(() => {}, 1000);
clearInterval(interval);
```

### 2. Use sleep() for Simple Delays

```javascript
// ❌ Verbose
await new Promise(resolve => setTimeout(resolve, 1000));

// ✅ Simple
await sleep(1000);
```

### 3. Handle Long-Running Operations

```javascript
// Set reasonable timeouts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

await fetch(url, { signal: controller.signal });
```

### 4. Avoid Blocking

```javascript
// ❌ Blocking (if possible)
for (let i = 0; i < 1000000; i++) { /* heavy work */ }

// ✅ Non-blocking
for (let i = 0; i < 1000; i++) {
    // Do work in chunks
    if (i % 100 === 0) await sleep(0); // Yield to event loop
}
```

## Next Steps

- [Timers Module](/docs/api/modules/timers) - Complete API reference
- [HTTP Requests](/docs/guides/http-requests) - Async request patterns
- [Examples](/docs/examples/hello-world) - Async function examples

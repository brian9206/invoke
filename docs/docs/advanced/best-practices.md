# Best Practices

Production-ready patterns and recommendations for Invoke functions.

## Function Design

### Keep Functions Small and Focused
Each function should have a single, well-defined purpose.

```javascript
// ✅ Good - focused function
module.exports = async function(req, res) {
    const userId = req.params.userId;
    const user = await getUser(userId);
    res.json({ user });
};

// ❌ Avoid - doing too much
module.exports = async function(req, res) {
    // Handles users, orders, payments, notifications...
    // 500+ lines of code
};
```

### Stateless Design
Don't rely on global variables or state between invocations.

```javascript
// ❌ Don't do this
let cache = {};

module.exports = function(req, res) {
    cache[req.query.key] = req.body.value; // Won't persist
    res.json(cache);
};

// ✅ Use KV store
module.exports = async function(req, res) {
    await kv.set(req.query.key, req.body.value);
    res.json({ success: true });
};
```

### Fast Responses
Respond quickly and offload heavy processing.

```javascript
// ✅ Quick response
module.exports = async function(req, res) {
    // Queue for processing
    await kv.set(`job:${crypto.randomUUID()}`, req.body);
    
    res.status(202).json({
        message: 'Job queued',
        status: 'processing'
    });
};
```

## Error Handling

### Always Handle Errors
Use try-catch blocks and return appropriate error responses.

```javascript
module.exports = async function(req, res) {
    try {
        const result = await performOperation(req.body);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Operation failed:', error);
        res.status(500).json({
            error: 'Operation failed',
            message: error.message
        });
    }
};
```

### Validate Input
Always validate and sanitize user input.

```javascript
module.exports = async function(req, res) {
    // Validate required fields
    const { email, name } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({
            error: 'Invalid email address'
        });
    }
    
    if (!name || name.length < 2) {
        return res.status(400).json({
            error: 'Name must be at least 2 characters'
        });
    }
    
    // Process valid input
    const user = await createUser({ email, name });
    res.json({ user });
};
```

### Graceful Degradation
Handle service failures gracefully.

```javascript
module.exports = async function(req, res) {
    try {
        const data = await fetch('https://api.example.com/data');
        res.json(await data.json());
    } catch (error) {
        // Fallback to cached data
        const cached = await kv.get('cached:data');
        if (cached) {
            return res.json({ ...cached, fromCache: true });
        }
        
        // Last resort
        res.status(503).json({
            error: 'Service temporarily unavailable'
        });
    }
};
```

## Security

### Protect Sensitive Data
Never log or expose sensitive information.

```javascript
// ❌ Don't do this
console.log('User password:', req.body.password);
console.log('API key:', process.env.API_KEY);

// ✅ Safe logging
console.log('User login attempt:', { 
    email: req.body.email,
    timestamp: Date.now()
});
```

### Use Environment Variables for Secrets
Store API keys and secrets in environment variables.

```javascript
// ✅ Safe
const apiKey = process.env.API_KEY;
if (!apiKey) {
    return res.status(500).json({ error: 'Configuration error' });
}

const response = await fetch('https://api.example.com/data', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

### Implement Rate Limiting
Protect against abuse.

```javascript
module.exports = async function(req, res) {
    const ip = req.ip;
    const key = `ratelimit:${ip}`;
    
    const requests = await kv.get(key) || 0;
    
    if (requests >= 100) {
        return res.status(429).json({
            error: 'Too many requests',
            retryAfter: 60
        });
    }
    
    await kv.set(key, requests + 1, 60); // 60 second window
    
    // Process request
    res.json({ success: true });
};
```

### Verify Webhooks
Always verify webhook signatures.

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
    );
}

module.exports = function(req, res) {
    const signature = req.get('x-signature');
    const secret = process.env.WEBHOOK_SECRET;
    
    if (!verifySignature(JSON.stringify(req.body), signature, secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Process webhook
    res.json({ success: true });
};
```

## Performance

### Cache Frequently Accessed Data
Use KV store for caching.

```javascript
module.exports = async function(req, res) {
    const cacheKey = `cache:${req.path}`;
    
    // Check cache
    const cached = await kv.get(cacheKey);
    if (cached) {
        return res.json({ ...cached, fromCache: true });
    }
    
    // Fetch and cache
    const data = await fetchExpensiveData();
    await kv.set(cacheKey, data, 300); // 5 minutes
    
    res.json({ ...data, fromCache: false });
};
```

### Minimize External Requests
Batch API calls when possible.

```javascript
// ❌ Multiple requests
const user = await fetch('/api/user/1');
const posts = await fetch('/api/user/1/posts');
const comments = await fetch('/api/user/1/comments');

// ✅ Single batched request
const data = await fetch('/api/user/1?include=posts,comments');
```

### Stream Large Responses
Don't load everything into memory.

```javascript
module.exports = async function(req, res) {
    res.type('application/json');
    res.write('[');
    
    let first = true;
    for await (const item of streamItems()) {
        if (!first) res.write(',');
        res.write(JSON.stringify(item));
        first = false;
    }
    
    res.write(']');
    res.end();
};
```

### Use Appropriate Data Structures
Choose efficient data structures.

```javascript
// ❌ Inefficient lookup
const users = [/*...*/];
const user = users.find(u => u.id === userId);

// ✅ Efficient lookup
const usersMap = new Map(users.map(u => [u.id, u]));
const user = usersMap.get(userId);
```

## Logging and Monitoring

### Structured Logging
Log in a structured format for easy parsing.

```javascript
module.exports = async function(req, res) {
    console.log(JSON.stringify({
        level: 'info',
        message: 'Request received',
        method: req.method,
        path: req.path,
        timestamp: Date.now()
    }));
    
    try {
        const result = await processRequest(req);
        
        console.log(JSON.stringify({
            level: 'info',
            message: 'Request processed',
            duration: 123,
            timestamp: Date.now()
        }));
        
        res.json(result);
    } catch (error) {
        console.log(JSON.stringify({
            level: 'error',
            message: 'Request failed',
            error: error.message,
            stack: error.stack,
            timestamp: Date.now()
        }));
        
        res.status(500).json({ error: error.message });
    }
};
```

### Track Metrics
Store metrics for monitoring.

```javascript
module.exports = async function(req, res) {
    const startTime = Date.now();
    
    try {
        const result = await processRequest(req);
        
        // Track success
        await trackMetric('requests.success', 1);
        await trackMetric('requests.latency', Date.now() - startTime);
        
        res.json(result);
    } catch (error) {
        // Track failure
        await trackMetric('requests.error', 1);
        throw error;
    }
};

async function trackMetric(metric, value) {
    const key = `metrics:${metric}:${getTimeBucket()}`;
    const current = await kv.get(key) || 0;
    await kv.set(key, current + value, 3600);
}

function getTimeBucket() {
    // 5-minute buckets
    return Math.floor(Date.now() / 300000) * 300000;
}
```

## Code Organization

### Use Helper Functions
Extract reusable logic.

```javascript
// helpers.js (if supported)
function validateEmail(email) {
    return email && email.includes('@');
}

function sanitizeInput(input) {
    return input.trim().substring(0, 1000);
}

// index.js
module.exports = async function(req, res) {
    const { email, message } = req.body;
    
    if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }
    
    const sanitized = sanitizeInput(message);
    
    await processMessage(email, sanitized);
    res.json({ success: true });
};
```

### Document Your Code
Add comments for complex logic.

```javascript
/**
 * Processes webhook from payment provider
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports = async function(req, res) {
    // Verify webhook signature to prevent spoofing
    const isValid = verifySignature(req);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Extract and validate payment data
    const { amount, currency, orderId } = req.body;
    
    // Update order status in KV store
    await kv.set(`order:${orderId}`, {
        status: 'paid',
        amount,
        currency,
        paidAt: Date.now()
    });
    
    res.json({ success: true });
};
```

## Testing

### Test Locally
Use the Invoke admin panel or CLI to test functions before deployment.

### Handle Edge Cases
Test with various inputs.

```javascript
module.exports = async function(req, res) {
    const { items } = req.body;
    
    // Handle missing data
    if (!items) {
        return res.status(400).json({ error: 'items required' });
    }
    
    // Handle empty array
    if (!Array.isArray(items) || items.length === 0) {
        return res.json({ total: 0, items: [] });
    }
    
    // Handle invalid items
    const valid = items.filter(item => item && item.price > 0);
    
    const total = valid.reduce((sum, item) => sum + item.price, 0);
    
    res.json({ total, items: valid });
};
```

### Use TypeScript (If Supported)
Add type safety to catch errors early.

```typescript
interface RequestBody {
    email: string;
    name: string;
}

module.exports = async function(
    req: { body: RequestBody },
    res: any
) {
    const { email, name } = req.body;
    // Type-safe code
};
```

## Next Steps

- [Limitations](/docs/advanced/limitations) - Understand constraints
- [Debugging](/docs/advanced/debugging) - Troubleshoot issues
- [Examples](/docs/examples/hello-world) - See patterns in action

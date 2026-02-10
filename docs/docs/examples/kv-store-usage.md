# KV Store Usage Example

Practical examples of using the built-in key-value store.

## Session Management

```javascript
module.exports = async function(req, res) {
    const sessionId = req.cookies.sessionId || crypto.randomUUID();
    const sessionKey = `session:${sessionId}`;
    
    // Get or create session
    let session = await kv.get(sessionKey) || {
        id: sessionId,
        createdAt: Date.now(),
        data: {}
    };
    
    // Update session
    session.lastAccess = Date.now();
    session.visits = (session.visits || 0) + 1;
    
    // Store session with 1 hour TTL
    await kv.set(sessionKey, session, 3600);
    
    // Set cookie
    res.cookie('sessionId', sessionId, {
        httpOnly: true,
        maxAge: 3600000 // 1 hour
    });
    
    res.json({
        success: true,
        session: {
            id: session.id,
            visits: session.visits,
            createdAt: new Date(session.createdAt).toISOString(),
            lastAccess: new Date(session.lastAccess).toISOString()
        }
    });
};
```

## Rate Limiting

```javascript
module.exports = async function(req, res) {
    const identifier = req.ip || req.headers['x-forwarded-for'];
    const rateLimitKey = `ratelimit:${identifier}`;
    
    // Get current request count
    const data = await kv.get(rateLimitKey) || { count: 0, resetAt: Date.now() + 60000 };
    
    // Check if window has expired
    if (Date.now() > data.resetAt) {
        data.count = 0;
        data.resetAt = Date.now() + 60000; // 1 minute window
    }
    
    // Increment counter
    data.count++;
    
    // Store with TTL
    await kv.set(rateLimitKey, data, 60); // 60 seconds
    
    // Check rate limit (max 100 requests per minute)
    const limit = 100;
    const remaining = Math.max(0, limit - data.count);
    
    if (data.count > limit) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            limit,
            retryAfter: Math.ceil((data.resetAt - Date.now()) / 1000)
        });
    }
    
    // Set rate limit headers
    res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(data.resetAt).toISOString()
    });
    
    res.json({
        success: true,
        message: 'Request processed',
        rateLimit: {
            limit,
            remaining,
            resetAt: new Date(data.resetAt).toISOString()
        }
    });
};
```

## Caching API Responses

```javascript
module.exports = async function(req, res) {
    const cacheKey = `cache:${req.path}:${JSON.stringify(req.query)}`;
    
    // Check cache
    const cached = await kv.get(cacheKey);
    if (cached) {
        console.log('Cache HIT:', cacheKey);
        return res.json({
            ...cached,
            fromCache: true
        });
    }
    
    console.log('Cache MISS:', cacheKey);
    
    // Simulate expensive operation
    await sleep(1000);
    
    const data = {
        timestamp: new Date().toISOString(),
        query: req.query,
        result: {
            value: Math.random(),
            message: 'Generated data'
        }
    };
    
    // Cache for 5 minutes
    await kv.set(cacheKey, data, 300);
    
    res.json({
        ...data,
        fromCache: false
    });
};
```

## Feature Flags

```javascript
const DEFAULT_FLAGS = {
    newUI: false,
    betaFeatures: false,
    maintenance: false
};

module.exports = async function(req, res) {
    const path = req.path;
    const method = req.method;
    
    // GET /flags - Get all flags
    if (method === 'GET' && path === '/flags') {
        const flags = await kv.get('feature:flags') || DEFAULT_FLAGS;
        return res.json({ flags });
    }
    
    // GET /flags/:name - Get specific flag
    if (method === 'GET' && path.match(/^\/flags\/\w+$/)) {
        const flagName = path.split('/')[2];
        const flags = await kv.get('feature:flags') || DEFAULT_FLAGS;
        
        return res.json({
            name: flagName,
            enabled: flags[flagName] || false
        });
    }
    
    // POST /flags - Update flags
    if (method === 'POST' && path === '/flags') {
        const currentFlags = await kv.get('feature:flags') || DEFAULT_FLAGS;
        const updatedFlags = { ...currentFlags, ...req.body };
        
        await kv.set('feature:flags', updatedFlags);
        
        return res.json({
            success: true,
            flags: updatedFlags
        });
    }
    
    res.status(404).json({ error: 'Not found' });
};
```

## User Preferences

```javascript
module.exports = async function(req, res) {
    const userId = req.query.userId || req.body.userId;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    const prefsKey = `prefs:${userId}`;
    
    // GET preferences
    if (req.method === 'GET') {
        const prefs = await kv.get(prefsKey) || {
            theme: 'light',
            language: 'en',
            notifications: true,
            timezone: 'UTC'
        };
        
        return res.json({ userId, preferences: prefs });
    }
    
    // POST/PUT - Update preferences
    if (req.method === 'POST' || req.method === 'PUT') {
        const currentPrefs = await kv.get(prefsKey) || {};
        const updatedPrefs = { ...currentPrefs, ...req.body };
        
        // Remove userId from prefs if accidentally included
        delete updatedPrefs.userId;
        
        await kv.set(prefsKey, updatedPrefs);
        
        return res.json({
            success: true,
            userId,
            preferences: updatedPrefs
        });
    }
    
    // DELETE - Reset preferences
    if (req.method === 'DELETE') {
        await kv.delete(prefsKey);
        return res.json({
            success: true,
            message: 'Preferences reset'
        });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
};
```

## Distributed Lock

```javascript
async function acquireLock(lockKey, ttl = 10) {
    const lockValue = crypto.randomUUID();
    const lock = await kv.get(lockKey);
    
    if (lock) {
        return null; // Lock already held
    }
    
    await kv.set(lockKey, { owner: lockValue, acquiredAt: Date.now() }, ttl);
    return lockValue;
}

async function releaseLock(lockKey, lockValue) {
    const lock = await kv.get(lockKey);
    
    if (lock && lock.owner === lockValue) {
        await kv.delete(lockKey);
        return true;
    }
    
    return false;
}

module.exports = async function(req, res) {
    const resourceId = req.body.resourceId;
    
    if (!resourceId) {
        return res.status(400).json({ error: 'resourceId required' });
    }
    
    const lockKey = `lock:${resourceId}`;
    
    // Try to acquire lock
    const lockValue = await acquireLock(lockKey, 30); // 30 second TTL
    
    if (!lockValue) {
        return res.status(409).json({
            error: 'Resource is locked',
            message: 'Another process is using this resource'
        });
    }
    
    try {
        // Perform critical operation
        console.log('Lock acquired, processing...');
        await sleep(2000); // Simulate work
        
        // Update resource
        const resourceKey = `resource:${resourceId}`;
        const resource = await kv.get(resourceKey) || { count: 0 };
        resource.count++;
        resource.lastUpdated = Date.now();
        await kv.set(resourceKey, resource);
        
        res.json({
            success: true,
            message: 'Resource updated',
            resource
        });
        
    } finally {
        // Always release lock
        await releaseLock(lockKey, lockValue);
        console.log('Lock released');
    }
};
```

## Event Log

```javascript
module.exports = async function(req, res) {
    const { action, limit } = req.query;
    const EVENTS_KEY = 'events:log';
    const MAX_EVENTS = 1000;
    
    // Get events
    if (action === 'list') {
        const events = await kv.get(EVENTS_KEY) || [];
        const limitNum = parseInt(limit) || 100;
        
        return res.json({
            events: events.slice(-limitNum).reverse(),
            total: events.length
        });
    }
    
    // Add event
    if (req.method === 'POST') {
        const { type, data } = req.body;
        
        if (!type) {
            return res.status(400).json({ error: 'Event type required' });
        }
        
        const event = {
            id: crypto.randomUUID(),
            type,
            data,
            timestamp: Date.now(),
            ip: req.ip
        };
        
        const events = await kv.get(EVENTS_KEY) || [];
        events.push(event);
        
        // Keep only last MAX_EVENTS
        if (events.length > MAX_EVENTS) {
            events.splice(0, events.length - MAX_EVENTS);
        }
        
        await kv.set(EVENTS_KEY, events);
        
        return res.json({
            success: true,
            event
        });
    }
    
    // Clear events
    if (action === 'clear') {
        await kv.delete(EVENTS_KEY);
        return res.json({ success: true, message: 'Events cleared' });
    }
    
    res.status(400).json({ error: 'Invalid action' });
};
```

## Best Practices

### Keys
- **Use prefixes** - Namespace your keys (`user:123`, `cache:data`)
- **Consistent naming** - Use a naming convention
- **Avoid special characters** - Stick to alphanumeric and `:`, `-`, `_`

### TTL
- **Always set TTL for temporary data** - Sessions, cache, rate limits
- **Consider data lifetime** - Match TTL to use case
- **No TTL for permanent data** - User prefs, feature flags

### Performance
- **Batch operations when possible** - Reduce KV calls
- **Cache frequently accessed data** - In memory or KV
- **Monitor KV usage** - Track gets/sets per request

### Data Structure
- **Store objects, not strings** - KV handles JSON automatically
- **Keep values small** - Large values impact performance
- **Consider data relationships** - Structure keys logically

## Next Steps

- [KV Store API](/docs/api/kv-store) - Complete API reference
- [REST API Example](/docs/examples/rest-api) - Build APIs with KV
- [Best Practices](/docs/advanced/best-practices) - Production patterns

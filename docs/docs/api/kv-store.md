# KV Store

The KV Store is an Invoke-specific persistent key-value storage system available globally as `kv`. It's project-scoped and supports TTL (time-to-live).

## Overview

```javascript
module.exports = async function(req, res) {
    // Store a value
    await kv.set('user:name', 'Alice');
    
    // Retrieve a value
    const name = await kv.get('user:name');
    
    // Check if exists
    const exists = await kv.has('user:name');
    
    // Delete a key
    await kv.delete('user:name');
    
    res.json({ name, exists });
};
```

## API Methods

### kv.get(key)

Retrieve a value by key. Returns `null` if key doesn't exist or has expired.

```javascript
module.exports = async function(req, res) {
    const value = await kv.get('myKey');
    
    if (value === null) {
        return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json({ value });
};
```

**Returns:** `any` - The stored value, or `null` if not found

**Supported types:**
- Strings
- Numbers
- Booleans
- Objects
- Arrays
- null

### kv.set(key, value, ttl?)

Store a value with optional TTL (time-to-live) in milliseconds.

```javascript
module.exports = async function(req, res) {
    // Permanent storage
    await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });
    
    // With TTL (expires in 1 hour)
    await kv.set('session:abc', { userId: 123 }, 3600000);
    
    // TTL in 5 minutes
    await kv.set('temp:data', 'temporary', 300000);
    
    res.json({ stored: true });
};
```

**Parameters:**
- `key` (string) - The key to store under
- `value` (any) - The value to store
- `ttl` (number, optional) - TTL in milliseconds

**Returns:** `Promise<void>`

### kv.has(key)

Check if a key exists (and hasn't expired).

```javascript
module.exports = async function(req, res) {
    const hasUser = await kv.has('user:123');
    const hasSession = await kv.has('session:abc');
    
    res.json({ hasUser, hasSession });
};
```

**Returns:** `Promise<boolean>` - `true` if key exists, `false` otherwise

### kv.delete(key)

Delete a key from the store.

```javascript
module.exports = async function(req, res) {
    const deleted = await kv.delete('user:123');
    
    res.json({ 
        deleted, // true if key existed, false if not
        message: deleted ? 'Key deleted' : 'Key not found'
    });
};
```

**Returns:** `Promise<boolean>` - `true` if key was deleted, `false` if key didn't exist

### kv.clear()

Delete all keys in the project's namespace.

```javascript
module.exports = async function(req, res) {
    await kv.clear();
    res.json({ message: 'All keys cleared' });
};
```

**Returns:** `Promise<void>`

**Warning:** This deletes ALL keys for the project. Use with caution!

## Common Patterns

### Simple Counter

```javascript
module.exports = async function(req, res) {
    // Get current count
    let count = await kv.get('counter') || 0;
    
    // Increment
    count++;
    
    // Store new value
    await kv.set('counter', count);
    
    res.json({ count });
};
```

### Session Management

```javascript
const crypto = require('crypto');

module.exports = async function(req, res) {
    if (req.method === 'POST') {
        // Create session
        const sessionId = crypto.randomUUID();
        const session = {
            userId: req.body.userId,
            createdAt: Date.now()
        };
        
        // Store for 24 hours
        await kv.set(`session:${sessionId}`, session, 86400000);
        
        res.json({ sessionId });
    } else {
        // Validate session
        const sessionId = req.query.sessionId;
        const session = await kv.get(`session:${sessionId}`);
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        res.json({ userId: session.userId });
    }
};
```

###Caching API Responses

```javascript
module.exports = async function(req, res) {
    const cacheKey = `api:users:${req.query.id}`;
    
    // Check cache first
    let user = await kv.get(cacheKey);
    
    if (user) {
        console.log('Cache hit');
        return res.json({ user, cached: true });
    }
    
    // Cache miss - fetch from API
    console.log('Cache miss');
    const response = await fetch(`https://api.example.com/users/${req.query.id}`);
    user = await response.json();
    
    // Store in cache for 10 minutes
    await kv.set(cacheKey, user, 600000);
    
    res.json({ user, cached: false });
};
```

### Rate Limiting

```javascript
module.exports = async function(req, res) {
    const clientId = req.headers['x-client-id'] || req.ip;
    const rateLimitKey = `ratelimit:${clientId}`;
    
    // Get current request count
    let requestCount = await kv.get(rateLimitKey) || 0;
    
    if (requestCount >= 100) {
        return res.status(429).json({ 
            error: 'Rate limit exceeded',
            message: 'Maximum 100 requests per hour'
        });
    }
    
    // Increment counter
    requestCount++;
    
    // Set with 1 hour TTL
    await kv.set(rateLimitKey, requestCount, 3600000);
    
    // Set rate limit headers
    res.set({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': String(100 - requestCount)
    });
    
    res.json({ message: 'Success', requestCount });
};
```

### Feature Flags

```javascript
module.exports = async function(req, res) {
    const featureKey = 'feature:newUI';
    
    // Check if feature is enabled
    const isEnabled = await kv.get(featureKey);
    
    if (isEnabled) {
        res.json({ ui: 'new', message: 'New UI enabled' });
    } else {
        res.json({ ui: 'old', message: 'Old UI' });
    }
};

// Admin endpoint to toggle feature
module.exports.admin = async function(req, res) {
    const { feature, enabled } = req.body;
    await kv.set(`feature:${feature}`, enabled);
    res.json({ success: true });
};
```

### User Preferences

```javascript
module.exports = async function(req, res) {
    const userId = req.query.userId;
    const prefsKey = `prefs:${userId}`;
    
    if (req.method === 'GET') {
        // Get preferences
        const prefs = await kv.get(prefsKey) || {
            theme: 'light',
            language: 'en',
            notifications: true
        };
        
        res.json({ preferences: prefs });
    } else if (req.method === 'POST') {
        // Update preferences
        const currentPrefs = await kv.get(prefsKey) || {};
        const newPrefs = { ...currentPrefs, ...req.body };
        
        await kv.set(prefsKey, newPrefs);
        
        res.json({ preferences: newPrefs });
    }
};
```

### Temporary Data Storage

```javascript
module.exports = async function(req, res) {
    if (req.method === 'POST') {
        // Generate share link
        const shareId = crypto.randomUUID();
        const data = req.body;
        
        // Store for 1 hour
        await kv.set(`share:${shareId}`, data, 3600000);
        
        res.json({ 
            shareId,
            expiresIn: 3600,
            url: `${req.baseUrl}/share?id=${shareId}`
        });
    } else {
        // Retrieve shared data
        const shareId = req.query.id;
        const data = await kv.get(`share:${shareId}`);
        
        if (!data) {
            return res.status(404).json({ error: 'Share link expired or not found' });
        }
        
        res.json({ data });
    }
};
```

### Leaderboard

```javascript
module.exports = async function(req, res) {
    const leaderboardKey = 'game:leaderboard';
    
    if (req.method === 'POST') {
        // Add score
        const { player, score } = req.body;
        
        let leaderboard = await kv.get(leaderboardKey) || [];
        leaderboard.push({ player, score, timestamp: Date.now() });
        
        // Keep top 10, sorted by score
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 10);
        
        await kv.set(leaderboardKey, leaderboard);
        
        res.json({ leaderboard });
    } else {
        // Get leaderboard
        const leaderboard = await kv.get(leaderboardKey) || [];
        res.json({ leaderboard });
    }
};
```

### Complex Data Structures

```javascript
module.exports = async function(req, res) {
    const userId = req.query.userId;
    const cartKey = `cart:${userId}`;
    
    // Get cart
    let cart = await kv.get(cartKey) || { items: [], total: 0 };
    
    if (req.method === 'POST') {
        // Add item
        const { productId, quantity, price } = req.body;
        
        cart.items.push({ productId, quantity, price });
        cart.total += quantity * price;
        cart.updatedAt = Date.now();
        
        // Store for 7 days
        await kv.set(cartKey, cart, 604800000);
        
        res.json({ cart });
    } else if (req.method === 'DELETE') {
        // Clear cart
        await kv.delete(cartKey);
        res.json({ message: 'Cart cleared' });
    } else {
        // Get cart
        res.json({ cart });
    }
};
```

## Best Practices

### Namespacing Keys

Use prefixes to organize keys:

```javascript
// User data
await kv.set('user:123:profile', {...});
await kv.set('user:123:settings', {...});

// Sessions
await kv.set('session:abc123', {...});

// Cache
await kv.set('cache:api:users:123', {...});

// Features
await kv.set('feature:darkMode', true);
```

### Error Handling

```javascript
module.exports = async function(req, res) {
    try {
        const value = await kv.get('myKey');
        res.json({ value });
    } catch (error) {
        console.error('KV error:', error);
        res.status(500).json({ error: 'Storage error' });
    }
};
```

### Default Values

```javascript
module.exports = async function(req, res) {
    // Provide defaults for missing keys
    const settings = await kv.get('settings') || {
        theme: 'light',
        notifications: true
    };
    
    const counter = await kv.get('counter') || 0;
    
    res.json({ settings, counter });
};
```

### TTL Management

```javascript
// Short-lived data (5 minutes)
await kv.set('temp:data', value, 300000);

// Medium-lived data (1 hour)
await kv.set('cache:data', value, 3600000);

// Long-lived data (24 hours)
await kv.set('session:data', value, 86400000);

// Permanent data (no TTL)
await kv.set('permanent:data', value);
```

## Limitations

### Storage Quotas

- Keys are project-scoped
- Storage quota applies per project
- Check your plan for specific limits

### Value Size

- Large values (>1MB) may impact performance
- Consider compression for large data:

```javascript
const zlib = require('zlib');

// Compress before storing
const data = { large: 'data' };
const compressed = zlib.gzipSync(JSON.stringify(data));
await kv.set('key', compressed.toString('base64'));

// Decompress when retrieving
const stored = await kv.get('key');
const buffer = Buffer.from(stored, 'base64');
const decompressed = JSON.parse(zlib.gunzipSync(buffer).toString());
```

### TTL Precision

- TTL is in milliseconds
- Expiration may not be immediate (eventual consistency)
- Don't rely on exact timing for critical operations

## Important Notes

### Project Scope

- Each project has its own KV namespace
- Keys are NOT shared between projects
- Functions in the same project share the KV store

### Async Operations

- All KV operations are async and return Promises
- Always use `await` or `.then()`
- Handle errors appropriately

### No Transactions

- KV operations are not atomic
- For counters with race conditions, implement locking:

```javascript
// Simple implementation (may have race conditions)
let count = await kv.get('counter') || 0;
await kv.set('counter', count + 1);

// Better: use timestamp-based versioning
const entry = await kv.get('counter') || { value: 0, version: 0 };
entry.value++;
entry.version++;
await kv.set('counter', entry);
```

## Next Steps

- [Examples](/docs/examples/kv-store-usage) - KV Store examples
- [Guides](/docs/guides/http-requests) - Using KV with APIs
- [Advanced](/docs/advanced/best-practices) - Best practices

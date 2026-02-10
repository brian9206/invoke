# HTTP Requests Guide

Learn how to make HTTP and HTTPS requests from your Invoke functions.

## Using Fetch API (Recommended)

The modern `fetch` API is the recommended way to make HTTP requests:

```javascript
module.exports = async function(req, res) {
    try {
        const response = await fetch('https://api.example.com/data');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
```

### GET Requests

```javascript
module.exports = async function(req, res) {
    // Simple GET
    const response = await fetch(' https://api.github.com/users/octocat');
    const user = await response.json();
    
    // GET with query parameters
    const params = new URLSearchParams({
        q: 'javascript',
        sort: 'stars',
        order: 'desc'
    });
    const searchResponse = await fetch(`https://api.github.com/search/repositories?${params}`);
    const searchResults = await searchResponse.json();
    
    res.json({ user, searchResults });
};
```

### POST Requests

```javascript
module.exports = async function(req, res) {
    const response = await fetch('https://api.example.com/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: 'Alice',
            email: 'alice@example.com'
        })
    });
    
    const data = await response.json();
    res.status(201).json(data);
};
```

### Headers and Authentication

```javascript
module.exports = async function(req, res) {
    // Bearer token auth
    const response = await fetch('https://api.example.com/protected', {
        headers: {
            'Authorization': `Bearer ${process.env.API_TOKEN}`,
            'Content-Type': 'application/json',
        }
    });
    
    // Basic auth
    const credentials = Buffer.from('username:password').toString('base64');
    const basicResponse = await fetch('https://api.example.com/auth', {
        headers: {
            'Authorization': `Basic ${credentials}`
        }
    });
    
    // Custom headers
    const customResponse = await fetch('https://api.example.com/data', {
        headers: {
            'X-API-Key': process.env.API_KEY,
            'X-Request-ID': crypto.randomUUID(),
            'User-Agent': 'Invoke-Function/1.0'
        }
    });
    
    res.json({ success: true });
};
```

### Request Methods

```javascript
module.exports = async function(req, res) {
    const apiUrl = 'https://api.example.com/resource/123';
    
    // PUT - Update
    const putResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' })
    });
    
    // PATCH - Partial update
    const patchResponse = await fetch(apiUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com' })
    });
    
    // DELETE
    const deleteResponse = await fetch(apiUrl, {
        method: 'DELETE'
    });
    
    res.json({
        put: putResponse.status,
        patch: patchResponse.status,
        delete: deleteResponse.status
    });
};
```

### Response Handling

```javascript
module.exports = async function(req, res) {
    const response = await fetch('https://api.example.com/data');
    
    // Check status
    console.log(response.status);      // 200
    console.log(response.statusText);  // 'OK'
    console.log(response.ok);          // true for 200-299
    console.log(response.headers);     // Headers object
    
    // Parse based on content type
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
        const data = await response.json();
        res.json(data);
    } else if (contentType?.includes('text/')) {
        const text = await response.text();
        res.send(text);
    } else {
        const buffer = await response.buffer();
        res.send(buffer);
    }
};
```

### Error Handling

```javascript
module.exports = async function(req, res) {
    try {
        const response = await fetch('https://api.example.com/data');
        
        // Handle HTTP errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: 'API request failed',
                status: response.status,
                details: errorData
            });
        }
        
        const data = await response.json();
        res.json(data);
        
    } catch (error) {
        // Handle network errors
        console.error('Request failed:', error);
        res.status(500).json({
            error: 'Network error',
            message: error.message
        });
    }
};
```

### Timeout Handling

```javascript
module.exports = async function(req, res) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
        const response = await fetch('https://api.example.com/slow', {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await response.json();
        res.json(data);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            res.status(408).json({ error: 'Request timeout' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
};
```

## Using HTTP/HTTPS Modules

For more control, use the built-in `http` and `https` modules:

### Simple GET Request

```javascript
const https = require('https');

module.exports = function(req, res) {
    https.get('https://api.github.com/users/octocat', {
        headers: {
            'User-Agent': 'Invoke-Function'
        }
    }, (apiRes) => {
        let data = '';
        
        apiRes.on('data', (chunk) => {
            data += chunk;
        });
        
        apiRes.on('end', () => {
            res.json(JSON.parse(data));
        });
    }).on('error', (error) => {
        res.status(500).json({ error: error.message });
    });
};
```

### POST Request

```javascript
const https = require('https');

module.exports = function(req, res) {
    const postData = JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com'
    });
    
    const options = {
        hostname: 'api.example.com',
        port: 443,
        path: '/users',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    
    const request = https.request(options, (apiRes) => {
        let data = '';
        
        apiRes.on('data', (chunk) => {
            data += chunk;
        });
        
        apiRes.on('end', () => {
            res.status(apiRes.statusCode).json(JSON.parse(data));
        });
    });
    
    request.on('error', (error) => {
        res.status(500).json({ error: error.message });
    });
    
    request.write(postData);
    request.end();
};
```

## Common Patterns

### API Client Class

```javascript
class APIClient {
    constructor(baseURL, apiKey) {
        this.baseURL = baseURL;
        this.apiKey = apiKey;
    }
    
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        return response.json();
    }
    
    async get(endpoint) {
        return this.request(endpoint);
    }
    
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
}

module.exports = async function(req, res) {
    const client = new APIClient(
        'https://api.example.com',
        process.env.API_KEY
    );
    
    const users = await client.get('/users');
    const newUser = await client.post('/users', req.body);
    
    res.json({ users, newUser });
};
```

### Retry Logic

```javascript
async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            
            if (response.status >= 500 && i < retries - 1) {
                await sleep(1000 * Math.pow(2, i)); // Exponential backoff
                continue;
            }
            
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(1000 * Math.pow(2, i));
        }
    }
}

module.exports = async function(req, res) {
    const response = await fetchWithRetry('https://api.example.com/data');
    const data = await response.json();
    res.json(data);
};
```

### Parallel Requests

```javascript
module.exports = async function(req, res) {
    const [users, posts, comments] = await Promise.all([
        fetch('https://api.example.com/users').then(r => r.json()),
        fetch('https://api.example.com/posts').then(r => r.json()),
        fetch('https://api.example.com/comments').then(r => r.json())
    ]);
    
    res.json({ users, posts, comments });
};
```

### Caching Responses

```javascript
module.exports = async function(req, res) {
    const cacheKey = `api:data:${req.query.id}`;
    
    // Check cache
    let data = await kv.get(cacheKey);
    
    if (!data) {
        // Fetch from API
        const response = await fetch(`https://api.example.com/data/${req.query.id}`);
        data = await response.json();
        
        // Cache for 10 minutes
        await kv.set(cacheKey, data, 600000);
    }
    
    res.json(data);
};
```

## Best Practices

### 1. Use Environment Variables for Secrets

```javascript
// ❌ DON'T hardcode secrets
const response = await fetch('https://api.example.com', {
    headers: { 'Authorization': 'Bearer hardcoded-token' }
});

// ✅ DO use environment variables
const response = await fetch('https://api.example.com', {
    headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` }
});
```

### 2. Always Handle Errors

```javascript
// ❌ DON'T ignore errors
const response = await fetch('https://api.example.com');
const data = await response.json();

// ✅ DO handle errors
try {
    const response = await fetch('https://api.example.com');
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
} catch (error) {
    // Handle error
}
```

### 3. Set Appropriate Timeouts

```javascript
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);

const response = await fetch(url, { signal: controller.signal });
```

### 4. Use Proper Headers

```javascript
const response = await fetch('https://api.example.com', {
    headers: {
        'User-Agent': 'Invoke-Function/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});
```

## Next Steps

- [Response Object](/docs/api/response) - Handling responses
- [Crypto Module](/docs/api/modules/crypto) - Secure requests
- [Examples](/docs/examples/webhook-handler) - HTTP examples

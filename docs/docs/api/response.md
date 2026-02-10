# Response Object

The response object (`res`) is used to send data back to the client. It's compatible with Express.js response API.

## Overview

```javascript
module.exports = function(req, res) {
    // Send JSON
    res.json({ message: 'Hello' });
    
    // Send text
    // res.send('Hello World');
    
    // Send with status
    // res.status(201).json({ created: true });
};
```

## Sending Responses

### res.send(data)

Smart send that auto-detects content type:

```javascript
module.exports = function(req, res) {
    // String - sends as text/html
    res.send('Hello World');
    
    // Object - sends as JSON
    // res.send({ message: 'Hello' });
    
    // Buffer - sends as application/octet-stream
    // const buf = Buffer.from('Hello');
    // res.send(buf);
    
    // Array - sends as JSON
    // res.send([1, 2, 3]);
};
```

### res.json(object)

Send JSON response:

```javascript
module.exports = function(req, res) {
    res.json({
        success: true,
        message: 'Operation completed',
        data: {
            id: 123,
            name: 'Alice'
        },
        timestamp: new Date().toISOString()
    });
};
```

Automatically sets `Content-Type: application/json`.

### res.end(data)

End the response (optionally with data):

```javascript
module.exports = function(req, res) {
    res.setHeader('Content-Type', 'text/plain');
    res.end('Response complete');
    
    // Or just end without data
    // res.end();
};
```

### res.sendStatus(statusCode)

Send status code with default message:

```javascript
module.exports = function(req, res) {
    res.sendStatus(200); // Sends 'OK'
    // res.sendStatus(404); // Sends 'Not Found'
    // res.sendStatus(500); // Sends 'Internal Server Error'
};
```

## Status Codes

### res.status(code)

Set HTTP status code (chainable):

```javascript
module.exports = function(req, res) {
    // Success responses
    res.status(200).json({ message: 'OK' });
    res.status(201).json({ message: 'Created' });
    res.status(204).end(); // No Content
    
    // Client errors
    res.status(400).json({ error: 'Bad Request' });
    res.status(401).json({ error: 'Unauthorized' });
    res.status(403).json({ error: 'Forbidden' });
    res.status(404).json({ error: 'Not Found' });
    
    // Server errors
    res.status(500).json({ error: 'Internal Server Error' });
    res.status(503).json({ error: 'Service Unavailable' });
};
```

## File Operations

### res.sendFile(path, options)

Send a file with automatic MIME type detection:

```javascript
const path = require('path');

module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'files', 'document.pdf');
    res.sendFile(filePath);
};
```

**Options:**
- `root` - Root directory for relative paths
- `headers` - Additional headers to send

```javascript
module.exports = function(req, res) {
    res.sendFile('document.pdf', {
        root: path.join(__dirname, 'files'),
        headers: {
            'X-Custom-Header': 'value'
        }
    });
};
```

### res.download(path, filename)

Force file download (sets Content-Disposition header):

```javascript
const path = require('path');

module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'reports', 'report.pdf');
    res.download(filePath, 'monthly-report.pdf');
};
```

## Headers

### res.setHeader(name, value)

Set a response header:

```javascript
module.exports = function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Custom-Header', 'custom-value');
    res.setHeader('Cache-Control', 'no-cache');
    res.end('Done');
};
```

### res.set(name, value) or res.set(object)

Alias for setHeader (can set multiple):

```javascript
module.exports = function(req, res) {
    // Single header
    res.set('Content-Type', 'text/html');
    
    // Multiple headers
    res.set({
        'Content-Type': 'application/json',
        'X-API-Version': '1.0',
        'Cache-Control': 'public, max-age=3600'
    });
    
    res.send('OK');
};
```

### res.get(name)

Get a response header value:

```javascript
module.exports = function(req, res) {
    res.set('X-Custom', 'value');
    const custom = res.get('X-Custom');
    
    res.json({ custom });
};
```

### res.append(field, value)

Append value to a header:

```javascript
module.exports = function(req, res) {
    res.append('Set-Cookie', 'cookie1=value1');
    res.append('Set-Cookie', 'cookie2=value2');
    res.send('Cookies set');
};
```

### res.removeHeader(name)

Remove a response header:

```javascript
module.exports = function(req, res) {
    res.setHeader('X-Powered-By', 'Invoke');
    res.removeHeader('X-Powered-By');
    res.send('OK');
};
```

### res.type(mimeType)

Set Content-Type header:

```javascript
module.exports = function(req, res) {
    // Using MIME type
    res.type('application/json');
    
    // Using file extension
    res.type('json');
    res.type('html');
    res.type('txt');
    res.type('pdf');
    
    res.end('{"message": "Hello"}');
};
```

Alias: `res.contentType(type)`

## Cookies

### res.cookie(name, value, options)

Set a cookie:

```javascript
module.exports = function(req, res) {
    // Simple cookie
    res.cookie('username', 'alice');
    
    // With options
    res.cookie('session', 'abc123', {
        maxAge: 3600000,      // 1 hour in milliseconds
        httpOnly: true,       // Not accessible via JavaScript
        secure: true,         // Only over HTTPS
        sameSite: 'strict',   // CSRF protection
        path: '/',            // Cookie path
        domain: '.example.com' // Cookie domain
    });
    
    res.send('Cookies set');
};
```

**Options:**
- `maxAge` - Milliseconds until expiry
- `expires` - Expiry date
- `httpOnly` - HTTP-only flag
- `secure` - HTTPS-only flag
- `sameSite` - 'strict', 'lax', or 'none'
- `path` - Cookie path
- `domain` - Cookie domain

### res.clearCookie(name, options)

Clear a cookie:

```javascript
module.exports = function(req, res) {
    res.clearCookie('session');
    
    // With same options used when setting
    res.clearCookie('session', {
        path: '/',
        domain: '.example.com'
    });
    
    res.send('Cookie cleared');
};
```

## Redirects

### res.redirect(url) or res.redirect(status, url)

Redirect to another URL:

```javascript
module.exports = function(req, res) {
    // Default 302 redirect
    res.redirect('/new-path');
    
    // With specific status
    res.redirect(301, 'https://example.com');
    
    // Relative redirects
    res.redirect('../other-page');
    res.redirect('back'); // Referer or '/'
};
```

**Common status codes:**
- `301` - Moved Permanently
- `302` - Found (temporary)
- `303` - See Other
- `307` - Temporary Redirect
- `308` - Permanent Redirect

## Streaming

### res.pipeFrom(fetchResponse)

Pipe a fetch response directly to the client:

```javascript
module.exports = async function(req, res) {
    const response = await fetch('https://api.example.com/large-file.pdf');
    
    if (!response.ok) {
        return res.status(response.status).send('Upstream error');
    }
    
    // Copy headers
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    
    // Stream the response body
    await res.pipeFrom(response);
};
```

**Use cases:**
- Proxying large files
- Streaming API responses
- Avoiding memory buffering

## Common Patterns

### RESTful API Responses

```javascript
module.exports = function(req, res) {
    switch(req.method) {
        case 'GET':
            res.json({ items: [] });
            break;
            
        case 'POST':
            res.status(201).json({ 
                id: 123,
                message: 'Created' 
            });
            break;
            
        case 'PUT':
            res.json({ 
                id: 123,
                message: 'Updated' 
            });
            break;
            
        case 'DELETE':
            res.status(204).end();
            break;
            
        default:
            res.status(405).json({ 
                error: 'Method not allowed' 
            });
    }
};
```

### Error Responses

```javascript
module.exports = async function(req, res) {
    try {
        // Your code...
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
```

### Validation Errors

```javascript
module.exports = function(req, res) {
    const { email, password } = req.body;
    const errors = [];
    
    if (!email) {
        errors.push({ field: 'email', message: 'Email is required' });
    }
    
    if (!password) {
        errors.push({ field: 'password', message: 'Password is required' });
    } else if (password.length < 8) {
        errors.push({ 
            field: 'password', 
            message: 'Password must be at least 8 characters' 
        });
    }
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            errors 
        });
    }
    
    res.json({ success: true });
};
```

### Paginated Responses

```javascript
module.exports = function(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const total = 100; // Total items
    
    const items = []; // Your paginated data
    
    res.json({
        data: items,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
        }
    });
};
```

### CORS Headers

```javascript
module.exports = function(req, res) {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    });
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    
    res.json({ message: 'CORS enabled' });
};
```

### Content Negotiation

```javascript
module.exports = function(req, res) {
    const data = { message: 'Hello', timestamp: Date.now() };
    
    const format = req.accepts(['json', 'html']);
    
    if (format === 'json') {
        res.json(data);
    } else if (format === 'html') {
        res.type('html').send(`
            <html>
                <body>
                    <h1>${data.message}</h1>
                    <p>Timestamp: ${data.timestamp}</p>
                </body>
            </html>
        `);
    } else {
        res.status(406).json({ error: 'Not Acceptable' });
    }
};
```

### Caching Headers

```javascript
module.exports = function(req, res) {
    // Cache for 1 hour
    res.set({
        'Cache-Control': 'public, max-age=3600',
        'Expires': new Date(Date.now() + 3600000).toUTCString()
    });
    
    // Or no cache
    // res.set({
    //     'Cache-Control': 'no-cache, no-store, must-revalidate',
    //     'Pragma': 'no-cache',
    //     'Expires': '0'
    // });
    
    res.json({ data: 'cached data' });
};
```

## Important Notes

### Response Must Be Sent Once

```javascript
// ❌ WRONG - Multiple responses
module.exports = function(req, res) {
    res.json({ message: 'First' });
    res.json({ message: 'Second' }); // Error!
};

// ✅ CORRECT - Single response
module.exports = function(req, res) {
    if (someCondition) {
        return res.json({ message: 'First' });
    }
    res.json({ message: 'Second' });
};
```

### Use return with Early Responses

```javascript
module.exports = function(req, res) {
    if (!req.body.name) {
        return res.status(400).json({ error: 'Name required' });
    }
    
    // Continue processing...
    res.json({ success: true });
};
```

## Next Steps

- [Request Object](/docs/api/request) - Reading requests
- [Examples](/docs/examples/rest-api) - Response patterns
- [Guides](/docs/guides/file-serving) - File serving guide

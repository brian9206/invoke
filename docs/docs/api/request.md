# Request Object

The request object (`req`) contains information about the incoming HTTP request. It's compatible with Express.js request API.

## Overview

```javascript
module.exports = function(req, res) {
    console.log(req.method);   // 'GET', 'POST', etc.
    console.log(req.path);     // '/api/users'
    console.log(req.query);    // { name: 'Alice' }
    console.log(req.body);     // Parsed request body
    console.log(req.headers);  // Request headers
    
    res.json({ received: true });
};
```

## Properties

### req.method

The HTTP method of the request:

```javascript
module.exports = function(req, res) {
    switch(req.method) {
        case 'GET':
            // Handle GET
            break;
        case 'POST':
            // Handle POST
            break;
        case 'PUT':
            // Handle PUT
            break;
        case 'DELETE':
            // Handle DELETE
            break;
    }
    res.send('OK');
};
```

**Values:** `'GET'`, `'POST'`, `'PUT'`, `'DELETE'`, `'PATCH'`, `'HEAD'`, `'OPTIONS'`

### req.path

The path part of the URL:

```javascript
module.exports = function(req, res) {
    console.log(req.path);
    // Request: /api/users/123
    // Output: /api/users/123
    
    res.json({ path: req.path });
};
```

### req.url

The full URL including query string:

```javascript
module.exports = function(req, res) {
    console.log(req.url);
    // Request: /api/users?sort=name&limit=10
    // Output: /api/users?sort=name&limit=10
    
    res.json({ url: req.url });
};
```

### req.query

Parsed query string parameters as an object:

```javascript
module.exports = function(req, res) {
    // Request: /api/users?name=Alice&age=30&active=true
    
    console.log(req.query);
    // { name: 'Alice', age: '30', active: 'true' }
    
    const name = req.query.name;
    const age = parseInt(req.query.age);
    const active = req.query.active === 'true';
    
    res.json({ name, age, active });
};
```

**Note:** All query values are strings. Parse numbers/booleans as needed.

### req.body

Parsed request body (for POST/PUT/PATCH):

```javascript
module.exports = function(req, res) {
    // JSON body (Content-Type: application/json)
    console.log(req.body);
    // { name: 'Alice', email: 'alice@example.com' }
    
    const { name, email } = req.body;
    
    res.json({ created: true, name, email });
};
```

**Supported Content-Types:**
- `application/json` - Parsed as object
- `application/x-www-form-urlencoded` - Parsed as object
- `text/plain` - String
- `text/html` - String

### req.headers

Request headers object (lowercase keys):

```javascript
module.exports = function(req, res) {
    console.log(req.headers);
    // {
    //   'content-type': 'application/json',
    //   'user-agent': 'Mozilla/5.0...',
    //   'authorization': 'Bearer token123',
    //   ...
    // }
    
    const contentType = req.headers['content-type'];
    const userAgent = req.headers['user-agent'];
    const auth = req.headers['authorization'];
    
    res.json({ contentType, userAgent });
};
```

**Note:** All header names are lowercase.

### req.cookies

Parsed cookies object:

```javascript
module.exports = function(req, res) {
    // Request with: Cookie: session=abc123; user=alice
    
    console.log(req.cookies);
    // { session: 'abc123', user: 'alice' }
    
    const sessionId = req.cookies.session;
    const username = req.cookies.user;
    
    res.json({ sessionId, username });
};
```

### req.params

Route parameters (if using routing):

```javascript
module.exports = function(req, res) {
    // Route: /api/users/:userId/posts/:postId
    // Request: /api/users/123/posts/456
    
    console.log(req.params);
    // { userId: '123', postId: '456' }
    
    const userId = req.params.userId;
    const postId = req.params.postId;
    
    res.json({ userId, postId });
};
```

**Note:** This requires route configuration in the Invoke platform.

### req.xhr

Boolean indicating if request was made via XMLHttpRequest:

```javascript
module.exports = function(req, res) {
    if (req.xhr) {
        // AJAX request
        res.json({ message: 'AJAX response' });
    } else {
        // Regular request
        res.send('<html>...</html>');
    }
};
```

Checks for `X-Requested-With: XMLHttpRequest` header.

## Methods

### req.get(header)

Get a request header value (case-insensitive):

```javascript
module.exports = function(req, res) {
    const contentType = req.get('Content-Type');
    const userAgent = req.get('User-Agent');
    const customHeader = req.get('X-Custom-Header');
    
    res.json({ contentType, userAgent, customHeader });
};
```

Aliases: `req.header(name)`

### req.header(name)

Alias for `req.get()`:

```javascript
module.exports = function(req, res) {
    const auth = req.header('Authorization');
    res.json({ hasAuth: !!auth });
};
```

### req.is(type)

Check if the request Content-Type matches:

```javascript
module.exports = function(req, res) {
    if (req.is('json')) {
        // Content-Type is application/json
        const data = req.body;
        res.json({ received: data });
    } else if (req.is('text/html')) {
        // Content-Type is text/html
        res.send('HTML received');
    } else {
        res.status(415).send('Unsupported Media Type');
    }
};
```

**Examples:**
- `req.is('json')` - Matches `application/json`
- `req.is('html')` - Matches `text/html`
- `req.is('text/*')` - Matches any text type
- `req.is('application/json')` - Exact match

### req.accepts(types)

Content negotiation - check what client accepts:

```javascript
module.exports = function(req, res) {
    const accept = req.accepts(['json', 'html']);
    
    if (accept === 'json') {
        res.json({ message: 'JSON response' });
    } else if (accept === 'html') {
        res.send('<html><body>HTML response</body></html>');
    } else {
        res.status(406).send('Not Acceptable');
    }
};
```

**Examples:**
- `req.accepts('json')` - Check for JSON
- `req.accepts(['json', 'html'])` - Check multiple types
- `req.accepts('text/html')` - Check specific MIME type

### req.param(name, defaultValue)

Get parameter from params, query, or body (in that order):

```javascript
module.exports = function(req, res) {
    // Checks req.params.id, then req.query.id, then req.body.id
    const id = req.param('id', 'default-id');
    
    res.json({ id });
};
```

**Deprecated:** Use `req.params`, `req.query`, or `req.body` directly instead.

## Common Patterns

### Parsing Query Parameters

```javascript
module.exports = function(req, res) {
    // GET /api/users?page=2&limit=20&sort=name&active=true
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'id';
    const active = req.query.active === 'true';
    
    res.json({ page, limit, sort, active });
};
```

### Handling JSON POST

```javascript
module.exports = function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    if (!req.is('json')) {
        return res.status(400).json({ error: 'Content-Type must be application/json' });
    }
    
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Process data...
    
    res.status(201).json({ created: true, name, email });
};
```

### Authentication

```javascript
module.exports = function(req, res) {
    const authHeader = req.get('Authorization');
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid authentication format' });
    }
    
    const token = authHeader.substring(7);
    
    // Validate token...
    
    res.json({ authenticated: true });
};
```

### Content Type Negotiation

```javascript
module.exports = function(req, res) {
    const data = {
        message: 'Hello',
        timestamp: new Date().toISOString()
    };
    
    const accept = req.accepts(['json', 'html', 'text']);
    
    switch(accept) {
        case 'json':
            res.json(data);
            break;
        case 'html':
            res.send(`<html><body><h1>${data.message}</h1></body></html>`);
            break;
        case 'text':
            res.send(`${data.message}\n${data.timestamp}`);
            break;
        default:
            res.status(406).json({ error: 'Not Acceptable' });
    }
};
```

### Reading Cookies

```javascript
module.exports = function(req, res) {
    const sessionId = req.cookies.session;
    
    if (!sessionId) {
        return res.status(401).json({ error: 'No session' });
    }
    
    // Validate session...
    
    res.json({ session: sessionId });
};
```

### Handling Different Methods

```javascript
module.exports = function(req, res) {
    switch(req.method) {
        case 'GET':
            // List items
            res.json({ items: [] });
            break;
            
        case 'POST':
            // Create item
            const newItem = req.body;
            res.status(201).json({ created: true, item: newItem });
            break;
            
        case 'PUT':
            // Update item
            const updatedItem = req.body;
            res.json({ updated: true, item: updatedItem });
            break;
            
        case 'DELETE':
            // Delete item
            res.json({ deleted: true });
            break;
            
        default:
            res.status(405).json({ error: 'Method not allowed' });
    }
};
```

## Request Validation

### Validate Required Fields

```javascript
module.exports = function(req, res) {
    const requiredFields = ['name', 'email', 'password'];
    const missing = requiredFields.filter(field => !req.body[field]);
    
    if (missing.length > 0) {
        return res.status(400).json({
            error: 'Missing required fields',
            missing
        });
    }
    
    res.json({ valid: true });
};
```

### Validate Email

```javascript
module.exports = function(req, res) {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    res.json({ valid: true });
};
```

## Next Steps

- [Response Object](/docs/api/response) - Sending responses
- [Examples](/docs/examples/rest-api) - Request handling examples
- [Guides](/docs/guides/http-requests) - HTTP request patterns

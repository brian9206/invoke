# Hello World Example

The simplest Invoke function examples.

## Basic Hello World

```javascript
module.exports = function(req, res) {
    res.json({
        message: 'Hello World!',
        timestamp: new Date().toISOString()
    });
};
```

**Test:**
```bash
curl http://<your invoke-execution URL>/invoke/{functionId}
```

**Response:**
```json
{
  "message": "Hello World!",
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

## With Query Parameters

```javascript
module.exports = function(req, res) {
    const name = req.query.name || 'World';
    const greeting = req.query.greeting || 'Hello';
    
    res.json({
        message: `${greeting}, ${name}!`,
        timestamp: new Date().toISOString()
    });
};
```

**Test:**
```bash
curl "http://<your invoke-execution URL>/invoke/{functionId}?name=Alice&greeting=Hi"
```

**Response:**
```json
{
  "message": "Hi, Alice!",
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

## Async Hello World

```javascript
module.exports = async function(req, res) {
    // Simulate async operation
    await sleep(100);
    
    res.json({
        message: 'Hello from async function!',
        timestamp: new Date().toISOString()
    });
};
```

## Request Information

```javascript
module.exports = function(req, res) {
    res.json({
        message: 'Hello World!',
        request: {
            method: req.method,
            path: req.path,
            query: req.query,
            headers: {
                userAgent: req.get('user-agent'),
                host: req.get('host')
            }
        },
        timestamp: new Date().toISOString()
    });
};
```

## Different Response Formats

### JSON
```javascript
module.exports = function(req, res) {
    res.json({ message: 'Hello World!' });
};
```

### Plain Text
```javascript
module.exports = function(req, res) {
    res.send('Hello World!');
};
```

### HTML
```javascript
module.exports = function(req, res) {
    res.type('html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Hello</title></head>
        <body>
            <h1>Hello World!</h1>
            <p>Timestamp: ${new Date().toISOString()}</p>
        </body>
        </html>
    `);
};
```

## Next Steps

- [REST API Example](/docs/examples/rest-api) - Build a full API
- [Function Anatomy](/docs/getting-started/function-anatomy) - Learn function structure
- [Request Object](/docs/api/request) - Request API reference

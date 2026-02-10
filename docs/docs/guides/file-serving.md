# File Serving Guide

Learn how to serve static files from your Invoke functions.

## Basic File Serving

```javascript
const path = require('path');

module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(filePath);
};
```

## Serving a Static Website

```javascript
const path = require('path');
const fs = require('fs');

module.exports = function(req, res) {
    // Get requested path, default to index.html
    let requestPath = req.path === '/' ? 'index.html' : req.path.substring(1);
    
    // Security: prevent directory traversal
    if (requestPath.includes('..') || requestPath.includes('\\')) {
        return res.status(403).send('Forbidden');
    }
    
    // Build full file path
    const filePath = path.join(__dirname, 'public', requestPath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    
    // Check if it's a file (not a directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        return res.status(403).send('Forbidden');
    }
    
    // Serve the file
    res.sendFile(filePath);
};
```

## Project Structure

```
function.zip
├── index.js
├── package.json
└── public/
    ├── index.html
    ├── about.html
    ├── style.css
    ├── script.js
    └── images/
        └── logo.png
```

## MIME Type Detection

`res.sendFile()` automatically detects MIME types:

```javascript
// index.html     → text/html
// style.css      → text/css
// script.js      → application/javascript
// image.png      → image/png
// document.pdf   → application/pdf
```

## Manual MIME Types

```javascript
const mimeTypes = require('mime-types');

module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'files', req.query.file);
    
    // Get MIME type
    const mimeType = mimeTypes.lookup(filePath) || 'application/octet-stream';
    
    res.type(mimeType);
    res.sendFile(filePath);
};
```

## File Downloads

Force browser to download instead of display:

```javascript
module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'reports', 'report.pdf');
    res.download(filePath, 'monthly-report.pdf');
};
```

## Streaming Large Files

```javascript
const fs = require('fs');

module.exports = function(req, res) {
    const filePath = path.join(__dirname, 'large-file.mp4');
    
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'video/mp4');
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
};
```

## Security Best Practices

### 1. Prevent Directory Traversal

```javascript
// ❌ DANGEROUS
const filePath = path.join(__dirname, req.query.file);

// ✅ SAFE
let requestPath = req.path || '/';
if (requestPath.includes('..') || requestPath.includes('\\')) {
    return res.status(403).send('Forbidden');
}
```

### 2. Whitelist Extensions

```javascript
const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.gif'];

module.exports = function(req, res) {
    const ext = path.extname(req.path).toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
        return res.status(403).send('File type not allowed');
    }
    
    // Serve file...
};
```

### 3. Validate File Paths

```javascript
const publicDir = path.join(__dirname, 'public');

module.exports = function(req, res) {
    const filePath = path.join(publicDir, req.path);
    const resolvedPath = path.resolve(filePath);
    
    // Ensure resolved path is within public directory
    if (!resolvedPath.startsWith(publicDir)) {
        return res.status(403).send('Forbidden');
    }
    
    res.sendFile(resolvedPath);
};
```

## Caching Headers

```javascript
module.exports = function(req, res) {
    const ext = path.extname(req.path);
    
    // Cache static assets for 1 year
    if (['.css', '.js', '.png', '.jpg'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
    
    res.sendFile(filePath);
};
```

## Complete Example

```javascript
const path = require('path');
const fs = require('fs');

module.exports = function(req, res) {
    // Parse request path
    let requestPath = req.path === '/' ? '/index.html' : req.path;
    
    // Remove leading slash
    requestPath = requestPath.substring(1);
    
    // Security checks
    if (requestPath.includes('..') || requestPath.includes('\\')) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Build file path
    const publicDir = path.join(__dirname, 'public');
    const filePath = path.join(publicDir, requestPath);
    const resolvedPath = path.resolve(filePath);
    
    // Ensure within public directory
    if (!resolvedPath.startsWith(publicDir)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Check existence
    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>404 Not Found</title></head>
            <body>
                <h1>404 - File Not Found</h1>
                <p>The requested file was not found.</p>
            </body>
            </html>
        `);
    }
    
    // Check if file
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
        return res.status(403).json({ error: 'Not a file' });
    }
    
    // Set caching headers for static assets
    const ext = path.extname(resolvedPath);
    if (['.css', '.js', '.png', '.jpg', '.gif', '.svg'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    // Serve file
    res.sendFile(resolvedPath);
};
```

## Next Steps

- [Response Object](/docs/api/response) - File serving methods
- [Examples](/docs/examples/static-website) - Complete static site example
- [Path Module](/docs/api/modules/path) - Path manipulation

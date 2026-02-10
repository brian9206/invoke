---
sidebar_position: 1
---

# Welcome to Invoke

**Invoke** is a modern serverless function management platform that lets you deploy and execute custom functions in a secure, isolated VM environment.

## What is Invoke?

Invoke allows you to write serverless functions using Node.js-compatible JavaScript, with access to a rich set of built-in modules and APIs. Your functions run in a sandboxed environment with:

- **24 Built-in Modules**: Including `crypto`, `http`, `fs`, `dns`, and more
- **Express.js-compatible APIs**: Familiar `req` and `res` objects
- **Persistent Storage**: Built-in key-value store with TTL support
- **Modern JavaScript**: Full async/await, Promises, and ES6+ support
- **Package Support**: Use npm packages with `node_modules`

## Quick Example

Here's a simple Invoke function:

```javascript
module.exports = async function(req, res) {
    // Access request data
    const name = req.query.name || 'World';
    
    // Use built-in modules
    const crypto = require('crypto');
    const id = crypto.randomUUID();
    
    // Store data in KV store
    await kv.set(`user:${id}`, { name, timestamp: Date.now() });
    
    // Send response
    res.json({ 
        message: `Hello, ${name}!`,
        id 
    });
};
```

## Key Features

### 🔒 Secure Execution
Functions run in isolated VM environments with controlled access to system resources.

### 🌐 HTTP/HTTPS Support  
Make external API calls using `fetch`, `http`, or `https` modules.

### 💾 Built-in KV Store
Persistent key-value storage with automatic TTL management.

### 📦 npm Package Support
Include `node_modules` in your function packages for third-party libraries.

### ⚡ High Performance
Efficient execution with caching and resource pooling.

## What You'll Learn

- [Quick Start](/docs/getting-started/quick-start) - Create your first function in 5 minutes
- [API Reference](/docs/api/globals) - Complete documentation of available APIs
- [Guides](/docs/guides/http-requests) - Step-by-step tutorials for common tasks
- [Examples](/docs/examples/hello-world) - Real-world function examples

## Ready to Get Started?

Jump into the [Quick Start Guide](/docs/getting-started/quick-start) to create your first Invoke function!

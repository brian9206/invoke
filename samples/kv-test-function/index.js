module.exports = async function(req, res) {
  const path = req.path || '/';
  
  try {
    // Route: GET /get/:key - Get a value by key
    if (req.method === 'GET' && path.startsWith('/get/')) {
      const key = path.substring(5);
      if (!key) {
        return res.status(400).send({ error: 'Key is required' });
      }
      
      const value = await kv.get(key);
      
      if (value === undefined) {
        return res.status(404).send({ error: 'Key not found', key });
      }
      
      return res.send({ key, value });
    }
    
    // Route: POST /set - Set a key-value pair
    if (req.method === 'POST' && path === '/set') {
      const { key, value, ttl } = req.body;
      
      if (!key) {
        return res.status(400).send({ error: 'Key is required' });
      }
      
      if (value === undefined || value === null) {
        return res.status(400).send({ error: 'Value is required' });
      }
      
      try {
        await kv.set(key, value, ttl);
        return res.send({ success: true, key, value });
      } catch (error) {
        // Handle quota exceeded error
        if (error.message.includes('quota exceeded')) {
          return res.status(413).send({ error: error.message });
        }
        throw error;
      }
    }
    
    // Route: DELETE /delete/:key - Delete a key
    if (req.method === 'DELETE' && path.startsWith('/delete/')) {
      const key = path.substring(8);
      if (!key) {
        return res.status(400).send({ error: 'Key is required' });
      }
      
      const deleted = await kv.delete(key);
      return res.send({ success: true, deleted, key });
    }
    
    // Route: GET /has/:key - Check if key exists
    if (req.method === 'GET' && path.startsWith('/has/')) {
      const key = path.substring(5);
      if (!key) {
        return res.status(400).send({ error: 'Key is required' });
      }
      
      const exists = await kv.has(key);
      return res.send({ key, exists });
    }
    
    // Route: POST /clear - Clear all keys
    if (req.method === 'POST' && path === '/clear') {
      await kv.clear();
      return res.send({ success: true, message: 'All keys cleared' });
    }
    
    // Route: GET / - Demo page showing all operations
    if (req.method === 'GET' && path === '/') {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>KV Store Test Function</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .section {
      background: white;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    .example { margin: 15px 0; }
    .method { color: #61dafb; font-weight: bold; }
  </style>
</head>
<body>
  <h1>🔑 KV Store Test Function</h1>
  
  <div class="section">
    <h2>Available Endpoints</h2>
    
    <div class="example">
      <h3><span class="method">GET</span> /get/:key</h3>
      <p>Get a value by key</p>
      <pre>curl https://your-domain/invoke/&lt;function-id&gt;/get/mykey</pre>
    </div>
    
    <div class="example">
      <h3><span class="method">POST</span> /set</h3>
      <p>Set a key-value pair (with optional TTL)</p>
      <pre>curl -X POST https://your-domain/invoke/&lt;function-id&gt;/set \\
  -H "Content-Type: application/json" \\
  -d '{"key": "mykey", "value": "myvalue", "ttl": 3600000}'</pre>
    </div>
    
    <div class="example">
      <h3><span class="method">DELETE</span> /delete/:key</h3>
      <p>Delete a key</p>
      <pre>curl -X DELETE https://your-domain/invoke/&lt;function-id&gt;/delete/mykey</pre>
    </div>
    
    <div class="example">
      <h3><span class="method">GET</span> /has/:key</h3>
      <p>Check if a key exists</p>
      <pre>curl https://your-domain/invoke/&lt;function-id&gt;/has/mykey</pre>
    </div>
    
    <div class="example">
      <h3><span class="method">POST</span> /clear</h3>
      <p>Clear all keys in this project's namespace</p>
      <pre>curl -X POST https://your-domain/invoke/&lt;function-id&gt;/clear</pre>
    </div>
  </div>
  
  <div class="section">
    <h2>KV Store Features</h2>
    <ul>
      <li>Persistent key-value storage backed by PostgreSQL</li>
      <li>Project-scoped namespaces (isolated per project)</li>
      <li>Automatic JSON serialization/deserialization</li>
      <li>Storage quota enforcement (default 1GB per project)</li>
      <li>Optional TTL (time-to-live) for keys</li>
      <li>Keyv-compatible API (<code>get</code>, <code>set</code>, <code>delete</code>, <code>has</code>, <code>clear</code>)</li>
    </ul>
  </div>
  
  <div class="section">
    <h2>Usage Examples in Function Code</h2>
    
    <h3>Store a string:</h3>
    <pre>await kv.set('username', 'john_doe');</pre>
    
    <h3>Store an object:</h3>
    <pre>await kv.set('user', { name: 'John', age: 30, role: 'admin' });</pre>
    
    <h3>Store with TTL (expires after 1 hour):</h3>
    <pre>await kv.set('session', 'token123', 3600000); // 1 hour in ms</pre>
    
    <h3>Get a value:</h3>
    <pre>const username = await kv.get('username');
const user = await kv.get('user'); // Returns parsed object</pre>
    
    <h3>Check if key exists:</h3>
    <pre>if (await kv.has('session')) {
  console.log('Session is active');
}</pre>
    
    <h3>Delete a key:</h3>
    <pre>await kv.delete('session');</pre>
    
    <h3>Clear all keys (use with caution!):</h3>
    <pre>await kv.clear(); // Deletes all keys in your project</pre>
  </div>
  
  <div class="section">
    <h2>Error Handling</h2>
    <pre>try {
  await kv.set('mykey', 'large_value');
} catch (error) {
  if (error.message.includes('quota exceeded')) {
    console.error('Storage quota exceeded!');
    res.status(413).send({ error: 'Storage quota exceeded' });
  } else {
    throw error;
  }
}</pre>
  </div>
</body>
</html>
      `.trim();
      
      res.setHeader('content-type', 'text/html');
      return res.send(html);
    }
    
    // Route not found
    return res.status(404).send({ 
      error: 'Route not found',
      availableRoutes: [
        'GET /',
        'GET /get/:key',
        'POST /set',
        'DELETE /delete/:key',
        'GET /has/:key',
        'POST /clear'
      ]
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

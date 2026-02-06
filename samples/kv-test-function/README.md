# KV Store Test Function

A demonstration function showcasing the **Key-Value Store** feature in Invoke. This function provides a complete REST API for interacting with the project-scoped persistent KV storage.

## Features

- 🔑 **Persistent Storage**: Data is stored in PostgreSQL and persists across function executions
- 🔒 **Project Isolation**: Each project has its own isolated KV namespace
- 📦 **JSON Serialization**: Automatically handles JSON objects, arrays, and primitives
- ⏱️ **TTL Support**: Optional time-to-live for expiring keys
- 📊 **Quota Management**: Storage limits enforced per project (default 1GB)
- ✅ **Keyv-Compatible API**: Familiar interface with `get`, `set`, `delete`, `has`, `clear`

## API Endpoints

### Get Value
```bash
GET /get/:key
```

Retrieve a value by key.

**Example:**
```bash
curl https://your-domain/invoke/<function-id>/get/mykey
```

**Response:**
```json
{
  "key": "mykey",
  "value": "myvalue"
}
```

### Set Value
```bash
POST /set
Content-Type: application/json

{
  "key": "string",
  "value": any,
  "ttl": number (optional, milliseconds)
}
```

Store a key-value pair with optional TTL.

**Example:**
```bash
curl -X POST https://your-domain/invoke/<function-id>/set \
  -H "Content-Type: application/json" \
  -d '{"key": "user", "value": {"name": "John", "age": 30}}'
```

**With TTL (1 hour):**
```bash
curl -X POST https://your-domain/invoke/<function-id>/set \
  -H "Content-Type: application/json" \
  -d '{"key": "session", "value": "token123", "ttl": 3600000}'
```

### Delete Key
```bash
DELETE /delete/:key
```

Remove a key from storage.

**Example:**
```bash
curl -X DELETE https://your-domain/invoke/<function-id>/delete/mykey
```

### Check Key Existence
```bash
GET /has/:key
```

Check if a key exists without retrieving its value.

**Example:**
```bash
curl https://your-domain/invoke/<function-id>/has/mykey
```

**Response:**
```json
{
  "key": "mykey",
  "exists": true
}
```

### Clear All Keys
```bash
POST /clear
```

⚠️ **Warning:** Deletes all keys in your project's namespace.

**Example:**
```bash
curl -X POST https://your-domain/invoke/<function-id>/clear
```

## Usage in Your Functions

### Store Data

```javascript
// Store a string
await kv.set('username', 'john_doe');

// Store an object (automatically serialized)
await kv.set('user', { 
  name: 'John', 
  age: 30, 
  role: 'admin' 
});

// Store with TTL (expires after 1 hour)
await kv.set('session', 'token123', 3600000);

// Store an array
await kv.set('tags', ['javascript', 'nodejs', 'serverless']);
```

### Retrieve Data

```javascript
// Get a value
const username = await kv.get('username');
// Returns: "john_doe"

// Get an object (automatically parsed)
const user = await kv.get('user');
// Returns: { name: 'John', age: 30, role: 'admin' }

// Key doesn't exist
const missing = await kv.get('nonexistent');
// Returns: undefined
```

### Check Existence

```javascript
if (await kv.has('session')) {
  console.log('Session is active');
} else {
  console.log('Session expired or not found');
}
```

### Delete Data

```javascript
// Delete a key
const deleted = await kv.delete('session');
// Returns: true if key existed, false otherwise
```

### Clear All Data

```javascript
// Clear all keys in your project (use with caution!)
await kv.clear();
```

## Error Handling

### Quota Exceeded

When storage quota is exceeded, `kv.set()` throws an error:

```javascript
try {
  await kv.set('large-data', someLargeValue);
} catch (error) {
  if (error.message.includes('quota exceeded')) {
    console.error('Storage quota exceeded!');
    res.status(413).send({ 
      error: 'Storage quota exceeded',
      message: error.message 
    });
  } else {
    throw error;
  }
}
```

### General Error Handling

```javascript
try {
  const value = await kv.get('mykey');
  res.send({ value });
} catch (error) {
  console.error('KV operation failed:', error);
  res.status(500).send({ 
    error: 'Failed to access KV store' 
  });
}
```

## Best Practices

1. **Use Descriptive Keys**: Choose clear, meaningful key names
   ```javascript
   // Good
   await kv.set('user:123:profile', userData);
   
   // Avoid
   await kv.set('u123', userData);
   ```

2. **Set TTL for Temporary Data**: Use TTL for sessions, caches, and temporary tokens
   ```javascript
   await kv.set('cache:api-response', data, 300000); // 5 minutes
   ```

3. **Handle Missing Keys**: Always check for `undefined` when getting values
   ```javascript
   const value = await kv.get('mykey');
   if (value === undefined) {
     // Key doesn't exist, handle appropriately
   }
   ```

4. **Monitor Storage Usage**: Check storage usage in the admin panel's KV Store page

5. **Namespace Your Keys**: Use prefixes to organize related data
   ```javascript
   await kv.set('user:settings', settings);
   await kv.set('user:preferences', preferences);
   await kv.set('cache:product:123', product);
   ```

## Managing KV Store

### Admin Panel

Access the **KV Store** page in the admin panel to:
- View all keys and values in your project
- Search and filter keys
- Edit or delete individual keys
- Monitor storage usage
- Export all data as JSON
- Import data from JSON files

### Storage Limits

- Default limit: **1 GB per project**
- Configurable in **Global Settings** (admin only)
- Both keys and values count toward the limit
- Quota is checked before each `set()` operation

## Common Use Cases

### Session Management
```javascript
// Store session
await kv.set(`session:${userId}`, {
  token: 'abc123',
  expiresAt: Date.now() + 3600000
}, 3600000); // 1 hour TTL

// Check session
const session = await kv.get(`session:${userId}`);
if (session) {
  // Session is valid
}
```

### API Response Caching
```javascript
const cacheKey = `cache:${req.url}`;
let data = await kv.get(cacheKey);

if (!data) {
  // Fetch from API
  data = await fetchFromAPI();
  
  // Cache for 5 minutes
  await kv.set(cacheKey, data, 300000);
}

res.send(data);
```

### Feature Flags
```javascript
const featureEnabled = await kv.get('feature:new-ui');

if (featureEnabled) {
  // Show new UI
} else {
  // Show old UI
}
```

### Rate Limiting
```javascript
const key = `ratelimit:${clientIp}`;
const count = (await kv.get(key)) || 0;

if (count >= 100) {
  return res.status(429).send({ error: 'Too many requests' });
}

await kv.set(key, count + 1, 60000); // Reset after 1 minute
```

## Deployment

Deploy this function through the admin panel:

1. Go to **Functions** → **Deploy Function**
2. Upload the `kv-test-function` directory
3. Access the function to see the interactive demo page
4. Try the API endpoints using curl or Postman

## Notes

- KV store is **project-scoped**: Functions in the same project share the same KV namespace
- Data persists across function executions and deployments
- KV operations are **asynchronous**: Always use `await`
- Storage includes both key and value sizes in quota calculations
- System project does not have KV store access

## Support

For issues or questions about the KV Store feature, check the Invoke documentation or contact your administrator.

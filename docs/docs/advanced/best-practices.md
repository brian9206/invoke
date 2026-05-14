import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Best Practices

Production-ready patterns and recommendations for Invoke functions.

## Function Design

### Keep Functions Small and Focused

Each function should have a single, well-defined purpose.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Good - focused function
export default async function handler(req, res) {
    const userId = req.params.userId;
    const user = await getUser(userId);
    res.json({ user });
}

// ❌ Avoid - doing too much
export default async function handler(req, res) {
    // Handles users, orders, payments, notifications...
    // 500+ lines of code
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Good - focused function
export default async function handler(req: any, res: any) {
  const userId = req.params.userId
  const user = await getUser(userId)
  res.json({ user })
}

// ❌ Avoid - doing too much
export default async function handler(req: any, res: any) {
  // Handles users, orders, payments, notifications...
  // 500+ lines of code
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ✅ Good - focused function
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var userId = req.Params["userId"];
    var user = await GetUser(userId);
    res.Json(new JsonObject { ["user"] = user });
}

// ❌ Avoid - doing too much
// A single handler that handles users, orders, payments, notifications...
// 500+ lines of code
```

</TabItem>
</Tabs>

### Stateless Design

Don't rely on global variables or state between invocations.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Don't do this
let cache = {};

export default function handler(req, res) {
    cache[req.query.key] = req.body.value; // Won't persist
    res.json(cache);
}

// ✅ Use KV store
export default async function handler(req, res) {
    await kv.set(req.query.key, req.body.value);
    res.json({ success: true });
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Don't do this
let cache: Record<string, any> = {}

export default function handler(req: any, res: any) {
  cache[req.query.key] = req.body.value // Won't persist
  res.json(cache)
}

// ✅ Use KV store
export default async function handler(req: any, res: any) {
  await kv.set(req.query.key, req.body.value)
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ❌ Don't do this — static cache won't persist across invocations
static Dictionary<string, string> cache = new();

// ✅ Use KV store
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    await kv.Set(req.Query["key"], req.Body?["value"]?.GetValue<string>());
    res.Json(new JsonObject { ["success"] = true });
}
```

</TabItem>
</Tabs>

### Fast Responses

Respond quickly and offload heavy processing.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Quick response
export default async function handler(req, res) {
  // Queue for processing
  await kv.set(`job:${crypto.randomUUID()}`, req.body)

  res.status(202).json({
    message: 'Job queued',
    status: 'processing'
  })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Quick response
export default async function handler(req: any, res: any) {
  // Queue for processing
  await kv.set(`job:${crypto.randomUUID()}`, req.body)

  res.status(202).json({
    message: 'Job queued',
    status: 'processing'
  })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ✅ Quick response
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    // Queue for processing
    var kv = new KeyValueStore();
    await kv.Set($"job:{Guid.NewGuid()}", req.Body?.ToJsonString());

    res.Status(202).Json(new JsonObject
    {
        ["message"] = "Job queued",
        ["status"] = "processing"
    });
}
```

</TabItem>
</Tabs>

## Error Handling

### Always Handle Errors

Use try-catch blocks and return appropriate error responses.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  try {
    const result = await performOperation(req.body)
    res.json({ success: true, result })
  } catch (error) {
    console.error('Operation failed:', error)
    res.status(500).json({
      error: 'Operation failed',
      message: error.message
    })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  try {
    const result = await performOperation(req.body)
    res.json({ success: true, result })
  } catch (error: any) {
    console.error('Operation failed:', error)
    res.status(500).json({
      error: 'Operation failed',
      message: error.message
    })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    try
    {
        var result = await PerformOperation(req.Body);
        res.Json(new JsonObject { ["success"] = true, ["result"] = result });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Operation failed: {ex}");
        res.Status(500).Json(new JsonObject
        {
            ["error"] = "Operation failed",
            ["message"] = ex.Message
        });
    }
}
```

</TabItem>
</Tabs>

### Validate Input

Always validate and sanitize user input.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Validate required fields
  const { email, name } = req.body

  if (!email || !email.includes('@')) {
    return res.status(400).json({
      error: 'Invalid email address'
    })
  }

  if (!name || name.length < 2) {
    return res.status(400).json({
      error: 'Name must be at least 2 characters'
    })
  }

  // Process valid input
  const user = await createUser({ email, name })
  res.json({ user })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
interface CreateUserBody {
  email: string
  name: string
}

export default async function handler(req: { body: CreateUserBody }, res: any) {
  const { email, name } = req.body

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' })
  }

  const user = await createUser({ email, name })
  res.json({ user })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var email = req.Body?["email"]?.GetValue<string>();
    var name = req.Body?["name"]?.GetValue<string>();

    if (string.IsNullOrEmpty(email) || !email.Contains('@'))
    {
        res.Status(400).Json(new JsonObject { ["error"] = "Invalid email address" });
        return;
    }

    if (string.IsNullOrEmpty(name) || name.Length < 2)
    {
        res.Status(400).Json(new JsonObject { ["error"] = "Name must be at least 2 characters" });
        return;
    }

    var user = await CreateUser(email, name);
    res.Json(new JsonObject { ["user"] = user });
}
```

</TabItem>
</Tabs>

### Graceful Degradation

Handle service failures gracefully.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  try {
    const data = await fetch('https://api.example.com/data')
    res.json(await data.json())
  } catch (error) {
    // Fallback to cached data
    const cached = await kv.get('cached:data')
    if (cached) {
      return res.json({ ...cached, fromCache: true })
    }

    // Last resort
    res.status(503).json({
      error: 'Service temporarily unavailable'
    })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  try {
    const data = await fetch('https://api.example.com/data')
    res.json(await data.json())
  } catch (error) {
    const cached = await kv.get('cached:data')
    if (cached) {
      return res.json({ ...(cached as object), fromCache: true })
    }
    res.status(503).json({ error: 'Service temporarily unavailable' })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    try
    {
        using var http = new HttpClient();
        var response = await http.GetAsync("https://api.example.com/data");
        var json = await response.Content.ReadAsStringAsync();
        res.Json(JsonNode.Parse(json));
    }
    catch
    {
        var kv = new KeyValueStore();
        var cached = await kv.Get("cached:data") as JsonNode;
        if (cached is not null)
        {
            res.Json(new JsonObject { ["data"] = cached, ["fromCache"] = true });
            return;
        }

        res.Status(503).Json(new JsonObject { ["error"] = "Service temporarily unavailable" });
    }
}
```

</TabItem>
</Tabs>

## Security

### Protect Sensitive Data

Never log or expose sensitive information.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Don't do this
console.log('User password:', req.body.password)
console.log('API key:', process.env.API_KEY)

// ✅ Safe logging
console.log('User login attempt:', {
  email: req.body.email,
  timestamp: Date.now()
})
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Don't do this
console.log('User password:', req.body.password)
console.log('API key:', process.env.API_KEY)

// ✅ Safe logging
console.log('User login attempt:', {
  email: req.body.email,
  timestamp: Date.now()
})
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ❌ Don't do this
Console.WriteLine($"User password: {req.Body?["password"]}");
Console.WriteLine($"API key: {Environment.GetEnvironmentVariable("API_KEY")}");

// ✅ Safe logging — use JsonObject for AOT-safe serialization
Console.WriteLine(new JsonObject
{
    ["message"] = "User login attempt",
    ["email"] = req.Body?["email"]?.GetValue<string>(),
    ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
}.ToJsonString());
```

</TabItem>
</Tabs>

### Use Environment Variables for Secrets

Store API keys and secrets in environment variables.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Safe
const apiKey = process.env.API_KEY
if (!apiKey) {
  return res.status(500).json({ error: 'Configuration error' })
}

const response = await fetch('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${apiKey}` }
})
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Safe
const apiKey = process.env.API_KEY
if (!apiKey) {
  return res.status(500).json({ error: 'Configuration error' })
}

const response = await fetch('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${apiKey}` }
})
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    // ✅ Safe
    var apiKey = Environment.GetEnvironmentVariable("API_KEY");
    if (string.IsNullOrEmpty(apiKey))
    {
        res.Status(500).Json(new JsonObject { ["error"] = "Configuration error" });
        return;
    }

    using var http = new HttpClient();
    http.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    var response = await http.GetAsync("https://api.example.com/data");
}
```

</TabItem>
</Tabs>

### Implement Rate Limiting

Protect against abuse.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const ip = req.ip
  const key = `ratelimit:${ip}`

  const requests = (await kv.get(key)) || 0

  if (requests >= 100) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: 60
    })
  }

  await kv.set(key, requests + 1, 60) // 60 second window

  // Process request
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  const ip: string = req.ip
  const key = `ratelimit:${ip}`

  const requests = ((await kv.get(key)) as number) || 0

  if (requests >= 100) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: 60 })
  }

  await kv.set(key, requests + 1, 60)
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var ip = req.Headers.TryGetValue("x-forwarded-for", out var fwd) ? fwd : req.Ip;
    var key = $"ratelimit:{ip}";
    var kv = new KeyValueStore();

    var raw = await kv.Get(key);
    var requests = raw is long n ? (int)n : 0;

    if (requests >= 100)
    {
        res.Status(429).Json(new JsonObject { ["error"] = "Too many requests", ["retryAfter"] = 60 });
        return;
    }

    await kv.Set(key, requests + 1, ttlMs: 60_000);
    res.Json(new JsonObject { ["success"] = true });
}
```

</TabItem>
</Tabs>

### Verify Webhooks

Always verify webhook signatures.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export default function handler(req, res) {
  const signature = req.get('x-signature')
  const secret = process.env.WEBHOOK_SECRET

  if (!verifySignature(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Process webhook
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export default function handler(req: any, res: any) {
  const signature = req.get('x-signature') as string
  const secret = process.env.WEBHOOK_SECRET!

  if (!verifySignature(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var signature = req.Headers.TryGetValue("x-signature", out var sig) ? sig : "";
    var secret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET")!;
    var payload = req.Body?.ToJsonString() ?? "{}";

    if (!VerifySignature(payload, signature, secret))
    {
        res.Status(401).Json(new JsonObject { ["error"] = "Invalid signature" });
        return Task.CompletedTask;
    }

    res.Json(new JsonObject { ["success"] = true });
    return Task.CompletedTask;
}

static bool VerifySignature(string payload, string signature, string secret)
{
    var key = Encoding.UTF8.GetBytes(secret);
    var data = Encoding.UTF8.GetBytes(payload);
    var digest = Convert.ToHexString(HMACSHA256.HashData(key, data)).ToLower();
    return CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(signature),
        Encoding.UTF8.GetBytes(digest));
}
```

</TabItem>
</Tabs>

## Performance

### Cache Frequently Accessed Data

Use KV store for caching.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const cacheKey = `cache:${req.path}`

  // Check cache
  const cached = await kv.get(cacheKey)
  if (cached) {
    return res.json({ ...cached, fromCache: true })
  }

  // Fetch and cache
  const data = await fetchExpensiveData()
  await kv.set(cacheKey, data, 300) // 5 minutes

  res.json({ ...data, fromCache: false })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  const cacheKey = `cache:${req.path}`

  const cached = await kv.get(cacheKey)
  if (cached) {
    return res.json({ ...(cached as object), fromCache: true })
  }

  const data = await fetchExpensiveData()
  await kv.set(cacheKey, data, 300)

  res.json({ ...data, fromCache: false })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    var cacheKey = $"cache:{req.Path}";

    var cached = await kv.Get(cacheKey) as JsonNode;
    if (cached is not null)
    {
        res.Json(new JsonObject { ["data"] = cached, ["fromCache"] = true });
        return;
    }

    var data = await FetchExpensiveData();
    await kv.Set(cacheKey, data?.ToJsonString(), ttlMs: 300_000);

    res.Json(new JsonObject { ["data"] = data, ["fromCache"] = false });
}
```

</TabItem>
</Tabs>

### Minimize External Requests

Batch API calls when possible.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Multiple requests
const user = await fetch('/api/user/1')
const posts = await fetch('/api/user/1/posts')
const comments = await fetch('/api/user/1/comments')

// ✅ Single batched request
const data = await fetch('/api/user/1?include=posts,comments')
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Multiple requests
const user = await fetch('/api/user/1')
const posts = await fetch('/api/user/1/posts')
const comments = await fetch('/api/user/1/comments')

// ✅ Single batched request
const data = await fetch('/api/user/1?include=posts,comments')
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using var http = new HttpClient();

// ❌ Multiple requests
var user = await http.GetAsync("/api/user/1");
var posts = await http.GetAsync("/api/user/1/posts");
var comments = await http.GetAsync("/api/user/1/comments");

// ✅ Single batched request
var data = await http.GetAsync("/api/user/1?include=posts,comments");
```

</TabItem>
</Tabs>

### Stream Large Responses

Don't load everything into memory.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  res.type('application/json')
  res.write('[')

  let first = true
  for await (const item of streamItems()) {
    if (!first) res.write(',')
    res.write(JSON.stringify(item))
    first = false
  }

  res.write(']')
  res.end()
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  res.type('application/json')
  res.write('[')

  let first = true
  for await (const item of streamItems()) {
    if (!first) res.write(',')
    res.write(JSON.stringify(item))
    first = false
  }

  res.write(']')
  res.end()
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    // InvokeResponse sends a complete response — build a JsonArray
    var items = new JsonArray();
    await foreach (var item in StreamItemsAsync())
        items.Add(item);

    res.Json(items);
}
```

</TabItem>
</Tabs>

### Use Appropriate Data Structures

Choose efficient data structures.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Inefficient lookup
const users = [
  /*...*/
]
const user = users.find(u => u.id === userId)

// ✅ Efficient lookup
const usersMap = new Map(users.map(u => [u.id, u]))
const user = usersMap.get(userId)
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
interface User {
  id: string
  name: string
}

// ❌ Inefficient lookup
const users: User[] = [
  /*...*/
]
const user = users.find(u => u.id === userId)

// ✅ Efficient lookup
const usersMap = new Map(users.map(u => [u.id, u]))
const user = usersMap.get(userId)
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ Inefficient lookup
var users = new List<User> { /*...*/ };
var user = users.FirstOrDefault(u => u.Id == userId);

// ✅ Efficient lookup
var usersDict = users.ToDictionary(u => u.Id);
var user = usersDict.GetValueOrDefault(userId);
```

</TabItem>
</Tabs>

## Logging and Monitoring

### Structured Logging

Log in a structured format for easy parsing.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Request received',
      method: req.method,
      path: req.path,
      timestamp: Date.now()
    })
  )

  try {
    const result = await processRequest(req)

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Request processed',
        duration: 123,
        timestamp: Date.now()
      })
    )

    res.json(result)
  } catch (error) {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Request failed',
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      })
    )

    res.status(500).json({ error: error.message })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Request received',
      method: req.method,
      path: req.path,
      timestamp: Date.now()
    })
  )

  try {
    const result = await processRequest(req)
    console.log(JSON.stringify({ level: 'info', message: 'Request processed', timestamp: Date.now() }))
    res.json(result)
  } catch (error: any) {
    console.log(
      JSON.stringify({ level: 'error', message: 'Request failed', error: error.message, timestamp: Date.now() })
    )
    res.status(500).json({ error: error.message })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    Console.WriteLine(new JsonObject
    {
        ["level"] = "info",
        ["message"] = "Request received",
        ["method"] = req.Method,
        ["path"] = req.Path,
        ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
    }.ToJsonString());

    try
    {
        var result = await ProcessRequest(req);
        Console.WriteLine(new JsonObject
        {
            ["level"] = "info",
            ["message"] = "Request processed",
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        }.ToJsonString());
        res.Json(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine(new JsonObject
        {
            ["level"] = "error",
            ["message"] = "Request failed",
            ["error"] = ex.Message,
            ["stack"] = ex.StackTrace,
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        }.ToJsonString());
        res.Status(500).Json(new JsonObject { ["error"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

### Track Metrics

Store metrics for monitoring.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const startTime = Date.now()

  try {
    const result = await processRequest(req)

    // Track success
    await trackMetric('requests.success', 1)
    await trackMetric('requests.latency', Date.now() - startTime)

    res.json(result)
  } catch (error) {
    // Track failure
    await trackMetric('requests.error', 1)
    throw error
  }
}

async function trackMetric(metric, value) {
  const key = `metrics:${metric}:${getTimeBucket()}`
  const current = (await kv.get(key)) || 0
  await kv.set(key, current + value, 3600)
}

function getTimeBucket() {
  // 5-minute buckets
  return Math.floor(Date.now() / 300000) * 300000
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  const startTime = Date.now()

  try {
    const result = await processRequest(req)
    await trackMetric('requests.success', 1)
    await trackMetric('requests.latency', Date.now() - startTime)
    res.json(result)
  } catch (error) {
    await trackMetric('requests.error', 1)
    throw error
  }
}

async function trackMetric(metric: string, value: number): Promise<void> {
  const key = `metrics:${metric}:${getTimeBucket()}`
  const current = ((await kv.get(key)) as number) || 0
  await kv.set(key, current + value, 3600)
}

function getTimeBucket(): number {
  return Math.floor(Date.now() / 300000) * 300000
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    try
    {
        var result = await ProcessRequest(req);
        await TrackMetric("requests.success", 1);
        await TrackMetric("requests.latency", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startTime);
        res.Json(result);
    }
    catch
    {
        await TrackMetric("requests.error", 1);
        throw;
    }
}

static async Task TrackMetric(string metric, long value)
{
    var kv = new KeyValueStore();
    var bucket = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 300_000) * 300_000;
    var key = $"metrics:{metric}:{bucket}";
    var raw = await kv.Get(key);
    var current = raw is long n ? n : 0;
    await kv.Set(key, current + value, ttlMs: 3_600_000);
}
```

</TabItem>
</Tabs>

## Code Organization

### Use Helper Functions

Extract reusable logic.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// helpers.js (if supported)
function validateEmail(email) {
  return email && email.includes('@')
}

function sanitizeInput(input) {
  return input.trim().substring(0, 1000)
}

// index.js
export default async function handler(req, res) {
  const { email, message } = req.body

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  const sanitized = sanitizeInput(message)

  await processMessage(email, sanitized)
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
function validateEmail(email: string): boolean {
  return !!email && email.includes('@')
}

function sanitizeInput(input: string): string {
  return input.trim().substring(0, 1000)
}

export default async function handler(req: any, res: any) {
  const { email, message } = req.body

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  const sanitized = sanitizeInput(message)
  await processMessage(email, sanitized)
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

static bool ValidateEmail(string? email) =>
    !string.IsNullOrEmpty(email) && email.Contains('@');

static string SanitizeInput(string input) =>
    input.Trim()[..Math.Min(input.Length, 1000)];

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var email = req.Body?["email"]?.GetValue<string>();
    var message = req.Body?["message"]?.GetValue<string>() ?? "";

    if (!ValidateEmail(email))
    {
        res.Status(400).Json(new JsonObject { ["error"] = "Invalid email" });
        return;
    }

    var sanitized = SanitizeInput(message);
    await ProcessMessage(email!, sanitized);
    res.Json(new JsonObject { ["success"] = true });
}
```

</TabItem>
</Tabs>

### Document Your Code

Add comments for complex logic.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
/**
 * Processes webhook from payment provider
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export default async function handler(req, res) {
  // Verify webhook signature to prevent spoofing
  const isValid = verifySignature(req)
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Extract and validate payment data
  const { amount, currency, orderId } = req.body

  // Update order status in KV store
  await kv.set(`order:${orderId}`, {
    status: 'paid',
    amount,
    currency,
    paidAt: Date.now()
  })

  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
interface PaymentWebhook {
  amount: number
  currency: string
  orderId: string
}

/**
 * Processes webhook from payment provider
 */
export default async function handler(req: { body: PaymentWebhook }, res: any) {
  // Verify webhook signature to prevent spoofing
  const isValid = verifySignature(req)
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const { amount, currency, orderId } = req.body

  // Update order status in KV store
  await kv.set(`order:${orderId}`, {
    status: 'paid',
    amount,
    currency,
    paidAt: Date.now()
  })

  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

/// <summary>
/// Processes webhook from payment provider
/// </summary>
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    // Verify webhook signature to prevent spoofing
    if (!VerifySignature(req))
    {
        res.Status(401).Json(new JsonObject { ["error"] = "Invalid signature" });
        return;
    }

    // Extract and validate payment data
    var amount = req.Body?["amount"]?.GetValue<decimal>() ?? 0;
    var currency = req.Body?["currency"]?.GetValue<string>();
    var orderId = req.Body?["orderId"]?.GetValue<string>();

    // Update order status in KV store
    var kv = new KeyValueStore();
    await kv.Set($"order:{orderId}", new JsonObject
    {
        ["status"] = "paid",
        ["amount"] = amount,
        ["currency"] = currency,
        ["paidAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
    }.ToJsonString());

    res.Json(new JsonObject { ["success"] = true });
}
```

</TabItem>
</Tabs>

## Testing

### Test Locally

Use the Invoke admin panel or CLI to test functions before deployment.

### Handle Edge Cases

Test with various inputs.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const { items } = req.body

  // Handle missing data
  if (!items) {
    return res.status(400).json({ error: 'items required' })
  }

  // Handle empty array
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ total: 0, items: [] })
  }

  // Handle invalid items
  const valid = items.filter(item => item && item.price > 0)

  const total = valid.reduce((sum, item) => sum + item.price, 0)

  res.json({ total, items: valid })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
interface Item {
  price: number
  name: string
}

export default async function handler(req: { body: { items?: Item[] } }, res: any) {
  const { items } = req.body

  if (!items) {
    return res.status(400).json({ error: 'items required' })
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ total: 0, items: [] })
  }

  const valid = items.filter(item => item && item.price > 0)
  const total = valid.reduce((sum, item) => sum + item.price, 0)
  res.json({ total, items: valid })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var items = req.Body?["items"] as JsonArray;

    if (items is null)
    {
        res.Status(400).Json(new JsonObject { ["error"] = "items required" });
        return Task.CompletedTask;
    }

    if (items.Count == 0)
    {
        res.Json(new JsonObject { ["total"] = 0, ["items"] = new JsonArray() });
        return Task.CompletedTask;
    }

    var valid = items
        .OfType<JsonObject>()
        .Where(item => item["price"]?.GetValue<decimal>() > 0)
        .ToList();

    var total = valid.Sum(item => item["price"]!.GetValue<decimal>());
    var validArray = new JsonArray(valid.Select(v => (JsonNode)v.DeepClone()).ToArray());
    res.Json(new JsonObject { ["total"] = total, ["items"] = validArray });
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

### Use TypeScript or C# for Type Safety

Add type safety to catch errors early.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const { email, name } = req.body
  // Validate at runtime since JS has no compile-time types
  if (!email || !name) return res.status(400).json({ error: 'Missing fields' })
  res.json({ email, name })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
interface RequestBody {
  email: string
  name: string
}

export default async function handler(req: { body: RequestBody }, res: any) {
  const { email, name } = req.body
  // Type-safe code — compiler catches missing fields
  res.json({ email, name })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

// C# is fully type-safe — all fields are checked at compile time
record RequestBody(string Email, string Name);

[JsonSerializable(typeof(RequestBody))]
partial class AppContext : JsonSerializerContext { }

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var body = req.Body.Deserialize<RequestBody>(AppContext.Default.RequestBody)!;
    res.Json(new JsonObject { ["email"] = body.Email, ["name"] = body.Name });
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Next Steps

- [Limitations](/docs/advanced/limitations) - Understand constraints
- [Debugging](/docs/advanced/debugging) - Troubleshoot issues
- [Examples](/docs/examples/hello-world) - See patterns in action

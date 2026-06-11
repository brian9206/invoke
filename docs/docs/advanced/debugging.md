import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Debugging

Troubleshooting and resolving issues in Invoke functions.

## Console Logging

### Basic Logging

Use `console.log()` to output debug information.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  console.log('Function invoked')
  console.log('Method:', req.method)
  console.log('Path:', req.path)
  console.log('Body:', req.body)

  const result = await processRequest(req.body)
  console.log('Result:', result)

  res.json(result)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  console.log('Function invoked')
  console.log('Method:', req.method)
  console.log('Path:', req.path)
  console.log('Body:', req.body)

  const result = await processRequest(req.body)
  console.log('Result:', result)

  res.json(result)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    Console.WriteLine("Function invoked");
    Console.WriteLine($"Method: {req.Method}");
    Console.WriteLine($"Path: {req.Path}");
    Console.WriteLine($"Body: {req.Body?.ToJsonString() ?? "null"}");

    var result = await ProcessRequest(req.Body);
    Console.WriteLine($"Result: {result?.ToJsonString()}");

    res.Json(result);
}
```

</TabItem>
</Tabs>

### Structured Logging

Log in JSON format for easier parsing.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
function log(level, message, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    })
  )
}

export default async function handler(req, res) {
  log('info', 'Request received', {
    method: req.method,
    path: req.path
  })

  try {
    const result = await processRequest(req.body)
    log('info', 'Request processed successfully', { result })
    res.json(result)
  } catch (error) {
    log('error', 'Request failed', {
      error: error.message,
      stack: error.stack
    })
    res.status(500).json({ error: error.message })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
function log(level: string, message: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    })
  )
}

export default async function handler(req: any, res: any) {
  log('info', 'Request received', { method: req.method, path: req.path })

  try {
    const result = await processRequest(req.body)
    log('info', 'Request processed successfully', { result })
    res.json(result)
  } catch (error: any) {
    log('error', 'Request failed', { error: error.message, stack: error.stack })
    res.status(500).json({ error: error.message })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

static void Log(string level, string message, JsonNode? data = null)
{
    Console.WriteLine(new JsonObject
    {
        ["timestamp"] = DateTime.UtcNow.ToString("o"),
        ["level"] = level,
        ["message"] = message,
        ["data"] = data
    }.ToJsonString());
}

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    Log("info", "Request received", new JsonObject { ["method"] = req.Method, ["path"] = req.Path });

    try
    {
        var result = await ProcessRequest(req.Body);
        Log("info", "Request processed successfully");
        res.Json(result);
    }
    catch (Exception ex)
    {
        Log("error", "Request failed", new JsonObject { ["error"] = ex.Message, ["stack"] = ex.StackTrace });
        res.Status(500).Json(new JsonObject { ["error"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

### Log Levels

Implement different log levels.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[LOG_LEVEL]
}

function log(level, message, data) {
  if (shouldLog(level)) {
    console.log(JSON.stringify({ level, message, ...data }))
  }
}

export default async function handler(req, res) {
  log('debug', 'Debug info', { query: req.query })
  log('info', 'Processing request', { path: req.path })

  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function shouldLog(level: string): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL]
}

function log(level: string, message: string, data?: Record<string, unknown>) {
  if (shouldLog(level)) {
    console.log(JSON.stringify({ level, message, ...data }))
  }
}

export default async function handler(req: any, res: any) {
  log('debug', 'Debug info', { query: req.query })
  log('info', 'Processing request', { path: req.path })
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

static readonly string LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "info";
static readonly Dictionary<string, int> Levels = new() {
    ["debug"] = 0, ["info"] = 1, ["warn"] = 2, ["error"] = 3
};

static bool ShouldLog(string level) =>
    Levels.GetValueOrDefault(level, 0) >= Levels.GetValueOrDefault(LogLevel, 1);

static void Log(string level, string message, JsonNode? data = null)
{
    if (ShouldLog(level))
        Console.WriteLine(new JsonObject { ["level"] = level, ["message"] = message, ["data"] = data }.ToJsonString());
}

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    Log("debug", "Debug info");
    Log("info", "Processing request", new JsonObject { ["path"] = req.Path });
    res.Json(new JsonObject { ["success"] = true });
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Error Handling

### Try-Catch Blocks

Always wrap async operations.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  try {
    const data = await fetch('https://api.example.com/data')
    const json = await data.json()
    res.json(json)
  } catch (error) {
    console.error('Fetch failed:', error.message)
    console.error('Stack:', error.stack)

    res.status(500).json({
      error: 'Failed to fetch data',
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
    const data = await fetch('https://api.example.com/data')
    const json = await data.json()
    res.json(json)
  } catch (error: any) {
    console.error('Fetch failed:', error.message)
    console.error('Stack:', error.stack)
    res.status(500).json({ error: 'Failed to fetch data', message: error.message })
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
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Fetch failed: {ex.Message}");
        Console.Error.WriteLine($"Stack: {ex.StackTrace}");
        res.Status(500).Json(new JsonObject { ["error"] = "Failed to fetch data", ["message"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

### Error Context

Include helpful context in errors.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
async function fetchUser(userId) {
  try {
    const response = await fetch(`https://api.example.com/users/${userId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch user:', {
      userId,
      error: error.message,
      url: `https://api.example.com/users/${userId}`
    })
    throw error
  }
}

export default async function handler(req, res) {
  const userId = req.params.userId

  try {
    const user = await fetchUser(userId)
    res.json({ user })
  } catch (error) {
    res.status(500).json({
      error: 'User fetch failed',
      userId,
      details: error.message
    })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
async function fetchUser(userId: string): Promise<any> {
  try {
    const response = await fetch(`https://api.example.com/users/${userId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.json()
  } catch (error: any) {
    console.error('Failed to fetch user:', { userId, error: error.message })
    throw error
  }
}

export default async function handler(req: any, res: any) {
  const userId: string = req.params.userId

  try {
    const user = await fetchUser(userId)
    res.json({ user })
  } catch (error: any) {
    res.status(500).json({ error: 'User fetch failed', userId, details: error.message })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

static async Task<JsonNode?> FetchUser(string userId)
{
    try
    {
        using var http = new HttpClient();
        var response = await http.GetAsync($"https://api.example.com/users/{userId}");
        if (!response.IsSuccessStatusCode)
            throw new Exception($"HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
        var json = await response.Content.ReadAsStringAsync();
        return JsonNode.Parse(json);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine(new JsonObject
        {
            ["message"] = "Failed to fetch user",
            ["userId"] = userId,
            ["error"] = ex.Message
        }.ToJsonString());
        throw;
    }
}

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var userId = req.Params["userId"];
    try
    {
        var user = await FetchUser(userId);
        res.Json(new JsonObject { ["user"] = user });
    }
    catch (Exception ex)
    {
        res.Status(500).Json(new JsonObject
        {
            ["error"] = "User fetch failed",
            ["userId"] = userId,
            ["details"] = ex.Message
        });
    }
}
```

</TabItem>
</Tabs>

### Error Types

Create custom error types for better handling.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
class ValidationError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export default async function handler(req, res) {
  try {
    const { email } = req.body

    if (!email || !email.includes('@')) {
      throw new ValidationError('Invalid email format', 'email')
    }

    const user = await findUser(email)
    if (!user) {
      throw new NotFoundError(`User not found: ${email}`)
    }

    res.json({ user })
  } catch (error) {
    console.error('Error:', error)

    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation failed',
        field: error.field,
        message: error.message
      })
    }

    if (error instanceof NotFoundError) {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
class ValidationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export default async function handler(req: any, res: any) {
  try {
    const { email } = req.body

    if (!email || !email.includes('@')) {
      throw new ValidationError('Invalid email format', 'email')
    }

    const user = await findUser(email)
    if (!user) {
      throw new NotFoundError(`User not found: ${email}`)
    }

    res.json({ user })
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: 'Validation failed', field: error.field, message: error.message })
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: 'Not found', message: (error as Error).message })
    }
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message })
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

class ValidationException(string message, string field) : Exception(message)
{
    public string Field { get; } = field;
}

class NotFoundException(string message) : Exception(message) { }

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    try
    {
        var email = req.Body?["email"]?.GetValue<string>();

        if (string.IsNullOrEmpty(email) || !email.Contains('@'))
            throw new ValidationException("Invalid email format", "email");

        var user = await FindUser(email);
        if (user is null)
            throw new NotFoundException($"User not found: {email}");

        res.Json(new JsonObject { ["user"] = user });
    }
    catch (ValidationException ex)
    {
        res.Status(400).Json(new JsonObject { ["error"] = "Validation failed", ["field"] = ex.Field, ["message"] = ex.Message });
    }
    catch (NotFoundException ex)
    {
        res.Status(404).Json(new JsonObject { ["error"] = "Not found", ["message"] = ex.Message });
    }
    catch (Exception ex)
    {
        res.Status(500).Json(new JsonObject { ["error"] = "Internal server error", ["message"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

## Request Inspection

### Debug Request Details

Log all request information.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const debug = {
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: req.headers,
    body: req.body,
    cookies: req.cookies,
    ip: req.ip,
    ips: req.ips,
    protocol: req.protocol,
    secure: req.secure,
    xhr: req.xhr
  }

  console.log('Request debug info:', JSON.stringify(debug, null, 2))

  res.json({ debug })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: any, res: any) {
  const debug = {
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: req.headers,
    body: req.body,
    ip: req.ip,
    protocol: req.protocol,
    secure: req.secure
  }

  console.log('Request debug info:', JSON.stringify(debug, null, 2))
  res.json({ debug })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var debug = new JsonObject
    {
        ["method"] = req.Method,
        ["path"] = req.Path,
        ["body"] = req.Body,
        ["ip"] = req.Ip
    };

    Console.WriteLine($"Request debug info: {debug.ToJsonString()}");
    res.Json(new JsonObject { ["debug"] = debug });
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

### Test Endpoint

Create a debug endpoint for testing.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  if (req.path === '/debug') {
    return res.json({
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        env: Object.keys(process.env)
      },
      timestamp: new Date().toISOString()
    })
  }

  // Normal function logic
  res.json({ message: 'Hello World' })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: any, res: any) {
  if (req.path === '/debug') {
    return res.json({
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body
      },
      timestamp: new Date().toISOString()
    })
  }

  res.json({ message: 'Hello World' })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    if (req.Path == "/debug")
    {
        res.Json(new JsonObject
        {
            ["request"] = new JsonObject
            {
                ["method"] = req.Method,
                ["path"] = req.Path,
                ["body"] = req.Body
            },
            ["environment"] = new JsonObject { ["runtime"] = "dotnet" },
            ["timestamp"] = DateTime.UtcNow.ToString("o")
        });
        return Task.CompletedTask;
    }

    res.Json(new JsonObject { ["message"] = "Hello World" });
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Common Issues

### Issue: Function Times Out

**Symptoms:**

- No response after 30 seconds
- Request appears to hang

**Causes:**

- Long-running synchronous operations
- Waiting for external service that doesn't respond
- Infinite loops

**Solutions:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Will timeout
export default async function handler(req, res) {
    await sleep(60000); // 60 seconds - exceeds timeout
    res.json({ done: true });
}

// ✅ Complete within timeout
export default async function handler(req, res) {
    // Queue work and respond immediately
    await kv.set(`job:${crypto.randomUUID()}`, req.body);
    res.status(202).json({
        status: 'queued',
        message: 'Processing will complete in background'
    });
}

// ✅ Add timeout to external requests
export default async function handler(req, res) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch('https://api.example.com/data', {
            signal: controller.signal
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            res.status(504).json({ error: 'Request timeout' });
        } else {
            res.status(500).json({ error: error.message });
        }
    } finally {
        clearTimeout(timeout);
    }
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Will timeout
export default async function handler(req: any, res: any) {
  await sleep(60000)
  res.json({ done: true })
}

// ✅ Complete within timeout
export default async function handler(req: any, res: any) {
  await kv.set(`job:${crypto.randomUUID()}`, req.body)
  res.status(202).json({ status: 'queued', message: 'Processing will complete in background' })
}

// ✅ Add timeout to external requests
export default async function handler(req: any, res: any) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch('https://api.example.com/data', { signal: controller.signal })
    const data = await response.json()
    res.json(data)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      res.status(504).json({ error: 'Request timeout' })
    } else {
      res.status(500).json({ error: error.message })
    }
  } finally {
    clearTimeout(timeout)
  }
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ❌ Will timeout
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    await Task.Delay(60_000); // 60 seconds - exceeds timeout
    res.Json(new JsonObject { ["done"] = true });
}

// ✅ Complete within timeout
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    await kv.Set($"job:{Guid.NewGuid()}", req.Body?.ToJsonString());
    res.Status(202).Json(new JsonObject { ["status"] = "queued", ["message"] = "Processing will complete in background" });
}

// ✅ Add timeout to external requests
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    try
    {
        using var http = new HttpClient();
        var response = await http.GetAsync("https://api.example.com/data", cts.Token);
        var data = await response.Content.ReadAsStringAsync();
        res.Json(JsonNode.Parse(data));
    }
    catch (OperationCanceledException)
    {
        res.Status(504).Json(new JsonObject { ["error"] = "Request timeout" });
    }
    catch (Exception ex)
    {
        res.Status(500).Json(new JsonObject { ["error"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

### Issue: Memory Errors

**Symptoms:**

- Function crashes with out of memory error
- Slow performance with large datasets

**Causes:**

- Loading large files into memory
- Creating large arrays or objects
- Memory leaks

**Solutions:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Memory intensive
export default async function handler(req, res) {
    const bigArray = new Array(10000000).fill({ data: 'value' });
    res.json(bigArray);
}

// ✅ Stream response
export default async function handler(req, res) {
    res.type('application/json');
    res.write('[');

    for (let i = 0; i < 1000; i++) {
        if (i > 0) res.write(',');
        res.write(JSON.stringify({ id: i, data: 'value' }));
    }

    res.write(']');
    res.end();
}

// ✅ Paginate data
export default async function handler(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;

    const items = await getItems(offset, limit);
    res.json({ items, page, hasMore: items.length === limit });
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Memory intensive
export default async function handler(req: any, res: any) {
  const bigArray = new Array(10000000).fill({ data: 'value' })
  res.json(bigArray)
}

// ✅ Stream response
export default async function handler(req: any, res: any) {
  res.type('application/json')
  res.write('[')
  for (let i = 0; i < 1000; i++) {
    if (i > 0) res.write(',')
    res.write(JSON.stringify({ id: i, data: 'value' }))
  }
  res.write(']')
  res.end()
}

// ✅ Paginate data
export default async function handler(req: any, res: any) {
  const page = parseInt(req.query.page as string) || 1
  const limit = 100
  const offset = (page - 1) * limit
  const items = await getItems(offset, limit)
  res.json({ items, page, hasMore: items.length === limit })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ❌ Memory intensive
[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    // Don't do this — loads millions of items into memory
    var bigArray = new JsonArray(
        Enumerable.Range(0, 10_000_000)
            .Select(_ => (JsonNode)new JsonObject { ["data"] = "value" })
            .ToArray());
    res.Json(bigArray);
    return Task.CompletedTask;
}

// ✅ Use JsonArray with reasonable size
[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var items = new JsonArray();
    for (int i = 0; i < 1000; i++)
        items.Add(new JsonObject { ["id"] = i, ["data"] = "value" });
    res.Json(items);
    return Task.CompletedTask;
}

// ✅ Paginate data
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var page = int.TryParse(req.Query["page"], out var p) ? p : 1;
    var limit = 100;
    var offset = (page - 1) * limit;
    var items = await GetItems(offset, limit);
    res.Json(new JsonObject { ["items"] = items, ["page"] = page, ["hasMore"] = items.Count == limit });
}
```

</TabItem>
</Tabs>

### Issue: Network Request Fails

**Symptoms:**

- Fetch throws error
- Cannot connect to external API

**Causes:**

- Network policy restrictions
- Invalid URL or endpoint
- SSL/TLS certificate issues
- API rate limiting

**Solutions:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.example.com/data', {
      method: 'GET',
      headers: {
        'User-Agent': 'Invoke-Function',
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Network request failed:', {
      error: error.message,
      stack: error.stack,
      url: 'https://api.example.com/data'
    })

    // Check if it's a network policy issue
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return res.status(502).json({
        error: 'Network request failed',
        message: 'Check network policies in admin panel',
        details: error.message
      })
    }

    res.status(500).json({
      error: 'Request failed',
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
    const response = await fetch('https://api.example.com/data', {
      method: 'GET',
      headers: { 'User-Agent': 'Invoke-Function', Accept: 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    res.json(data)
  } catch (error: any) {
    console.error('Network request failed:', { error: error.message, stack: error.stack })

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return res.status(502).json({
        error: 'Network request failed',
        message: 'Check network policies in admin panel',
        details: error.message
      })
    }

    res.status(500).json({ error: 'Request failed', message: error.message })
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
        http.DefaultRequestHeaders.Add("User-Agent", "Invoke-Function");
        http.DefaultRequestHeaders.Add("Accept", "application/json");

        var response = await http.GetAsync("https://api.example.com/data");

        if (!response.IsSuccessStatusCode)
            throw new Exception($"HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");

        var data = await response.Content.ReadAsStringAsync();
        res.Json(JsonNode.Parse(data));
    }
    catch (HttpRequestException ex)
    {
        Console.Error.WriteLine($"Network request failed: {ex.Message}");
        res.Status(502).Json(new JsonObject
        {
            ["error"] = "Network request failed",
            ["message"] = "Check network policies in admin panel",
            ["details"] = ex.Message
        });
    }
    catch (Exception ex)
    {
        res.Status(500).Json(new JsonObject { ["error"] = "Request failed", ["message"] = ex.Message });
    }
}
```

</TabItem>
</Tabs>

### Issue: KV Store Not Working

**Symptoms:**

- `kv.get()` returns unexpected values
- `kv.set()` doesn't persist data

**Causes:**

- TTL expired
- Key naming conflicts
- Not awaiting promises

**Solutions:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Not awaiting
export default function handler(req, res) {
    kv.set('key', 'value'); // Missing await
    const value = kv.get('key'); // Missing await
    res.json({ value }); // Will be undefined/promise
}

// ✅ Proper async/await
export default async function handler(req, res) {
    await kv.set('key', 'value');
    const value = await kv.get('key');
    res.json({ value }); // Correct value
}

// ✅ Check TTL
export default async function handler(req, res) {
    // Set with 1 hour TTL
    await kv.set('session', { user: 'alice' }, 3600);

    // Check if exists
    const exists = await kv.has('session');
    console.log('Session exists:', exists);

    const session = await kv.get('session');
    res.json({ session, exists });
}

// ✅ Debug key names
export default async function handler(req, res) {
    const key = `user:${req.params.id}`;
    console.log('Using key:', key);

    await kv.set(key, { name: 'Alice' });
    const user = await kv.get(key);

    console.log('Retrieved user:', user);
    res.json({ user });
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Not awaiting
export default function handler(req: any, res: any) {
  kv.set('key', 'value') // Missing await
  const value = kv.get('key') // Missing await — returns Promise
  res.json({ value }) // Will be undefined/promise
}

// ✅ Proper async/await
export default async function handler(req: any, res: any) {
  await kv.set('key', 'value')
  const value = await kv.get('key')
  res.json({ value })
}

// ✅ Check TTL
export default async function handler(req: any, res: any) {
  await kv.set('session', { user: 'alice' }, 3600)
  const exists = await kv.has('session')
  const session = await kv.get('session')
  res.json({ session, exists })
}

// ✅ Debug key names
export default async function handler(req: any, res: any) {
  const key = `user:${req.params.id}`
  console.log('Using key:', key)
  await kv.set(key, { name: 'Alice' })
  const user = await kv.get(key)
  res.json({ user })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ❌ Not awaiting
[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    _ = kv.Set("key", "value"); // Missing await
    var value = kv.Get("key"); // Missing await — returns Task
    res.Json(new JsonObject { ["value"] = "Will be Task, not value" });
    return Task.CompletedTask;
}

// ✅ Proper async/await
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    await kv.Set("key", "value");
    var value = await kv.Get("key");
    res.Json(new JsonObject { ["value"] = value as JsonNode });
}

// ✅ Check TTL
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    await kv.Set("session", new JsonObject { ["user"] = "alice" }.ToJsonString(), ttlMs: 3_600_000);
    var session = await kv.Get("session");
    var exists = session is not null;
    res.Json(new JsonObject { ["session"] = session as JsonNode, ["exists"] = exists });
}

// ✅ Debug key names
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    var key = $"user:{req.Params["id"]}";
    Console.WriteLine($"Using key: {key}");
    await kv.Set(key, new JsonObject { ["name"] = "Alice" }.ToJsonString());
    var user = await kv.Get(key);
    Console.WriteLine($"Retrieved user: {user}");
    res.Json(new JsonObject { ["user"] = user as JsonNode });
}
```

</TabItem>
</Tabs>

## Testing Tips

### Use curl for Testing

```bash
# GET request
curl http://<your invoke-execution URL>/invoke/{functionId}

# POST with JSON
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# With headers
curl http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Authorization: Bearer token" \
  -H "Custom-Header: value"

# With query params
curl "http://<your invoke-execution URL>/invoke/{functionId}?param1=value1&param2=value2"
```

### Test Different Scenarios

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Debug mode via query param
  if (req.query.debug === 'true') {
    console.log('DEBUG MODE')
    console.log('Request:', JSON.stringify(req.body, null, 2))
  }

  // Test error handling
  if (req.query.testError === 'true') {
    throw new Error('Test error')
  }

  // Test timeout
  if (req.query.testTimeout === 'true') {
    await sleep(35000) // Beyond timeout
  }

  // Normal operation
  res.json({ success: true })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: any, res: any) {
  if (req.query.debug === 'true') {
    console.log('DEBUG MODE')
    console.log('Request:', JSON.stringify(req.body, null, 2))
  }

  if (req.query.testError === 'true') {
    throw new Error('Test error')
  }

  if (req.query.testTimeout === 'true') {
    await sleep(35000)
  }

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
    if (req.Query["debug"] == "true")
    {
        Console.WriteLine("DEBUG MODE");
        Console.WriteLine($"Request: {req.Body?.ToJsonString() ?? "null"}");
    }

    if (req.Query["testError"] == "true")
        throw new Exception("Test error");

    if (req.Query["testTimeout"] == "true")
        await Task.Delay(35_000); // Beyond timeout

    res.Json(new JsonObject { ["success"] = true });
}
```

</TabItem>
</Tabs>

### Check Response Headers

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  // Log response headers being set
  res.set('Custom-Header', 'value')
  console.log('Response headers:', res.getHeaders())

  res.json({ message: 'Check headers' })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: any, res: any) {
  res.set('Custom-Header', 'value')
  console.log('Response headers:', res.getHeaders())
  res.json({ message: 'Check headers' })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    res.SetHeader("Custom-Header", "value")
       .Json(new JsonObject { ["message"] = "Check headers" });
    Console.WriteLine("Custom-Header set on response");
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Next Steps

- [Best Practices](/docs/advanced/best-practices) - Prevent common issues
- [Limitations](/docs/advanced/limitations) - Understand constraints
- [Examples](/docs/examples/hello-world) - Working code samples

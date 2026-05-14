import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Execution Environment Limitations

Understanding the constraints and restrictions of the Invoke sandbox execution environment.

## File System

### Ephemeral File System Access

The sandbox has full read/write access to the file system, but all writes are **ephemeral** — any files created or modified during an invocation are discarded when the invocation ends.

**Note:** Ephemeral storage is useful for temporary files within a single invocation (e.g., building a zip in memory, writing intermediary data). For data that must persist across invocations, use the KV Store.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import fs from 'fs'

export default async function handler(req, res) {
  // ✅ Works — file exists for this invocation only
  fs.writeFileSync('/tmp/data.txt', 'content')
  const content = fs.readFileSync('/tmp/data.txt', 'utf8')

  // ✅ For persistent data, use KV store
  await kv.set('data', 'content')
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import fs from 'fs'
import type { InvokeRequest, InvokeResponse } from 'invoke'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  // ✅ Works — file exists for this invocation only
  fs.writeFileSync('/tmp/data.txt', 'content')
  const content = fs.readFileSync('/tmp/data.txt', 'utf8')

  // ✅ For persistent data, use KV store
  await kv.set('data', 'content')
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.Text.Json.Nodes;

[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    // ✅ Works — file exists for this invocation only
    File.WriteAllText("/tmp/data.txt", "content");
    var content = File.ReadAllText("/tmp/data.txt");

    // ✅ For persistent data, use KV store
    var kv = new KeyValueStore();
    await kv.Set("data", "content");

    res.Json(new JsonObject { ["content"] = content });
}
```

</TabItem>
</Tabs>

## Network Restrictions

### No Direct Server Binding

Functions cannot create server sockets or bind to ports because it is in sandboxed network.

**Not Available:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Cannot create HTTP server
const server = http.createServer()
server.listen(3000)

// ❌ Cannot create TCP server
const server = net.createServer()
server.listen(8080)
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Cannot create HTTP server
const server = http.createServer()
server.listen(3000)

// ❌ Cannot create TCP server
const server = net.createServer()
server.listen(8080)
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ Cannot create HTTP server
var listener = new System.Net.HttpListener();
listener.Start(); // Not allowed in sandbox

// ❌ Cannot bind TCP sockets
var server = new System.Net.Sockets.TcpListener(8080);
server.Start(); // Not allowed in sandbox
```

</TabItem>
</Tabs>

**Available:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Make outbound HTTP requests
const response = await fetch('https://api.example.com/data')
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Make outbound HTTP requests
const response = await fetch('https://api.example.com/data')
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ✅ Make outbound HTTP requests
using var http = new HttpClient();
var response = await http.GetAsync("https://api.example.com/data");
```

</TabItem>
</Tabs>

### Network Policy Enforcement

Outbound connections are governed by network policies configured in the admin panel.

**Default:** All outbound connections are allowed

**Can be restricted to:**

- Specific domains/IPs
- Certain ports
- Allowed protocols (HTTP, HTTPS, WebSocket)

## Module Restrictions

## Resource Limits

### Execution Timeout

Functions have a maximum execution time.

**Default:** 30 seconds

**Impact:**

- Long-running operations will be terminated
- Use async patterns to handle multiple operations efficiently

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ May timeout
await sleep(60000) // 60 seconds

// ✅ Design for quick responses
res.json({ status: 'processing' })
// Queue heavy work for background processing
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ May timeout
await sleep(60000) // 60 seconds

// ✅ Design for quick responses
res.json({ status: 'processing' })
// Queue heavy work for background processing
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ May timeout
await Task.Delay(60000); // 60 seconds

// ✅ Design for quick responses
res.Json(new JsonObject { ["status"] = "processing" });
// Queue heavy work for background processing
```

</TabItem>
</Tabs>

### Memory Limits

Each function execution has limited memory.

**Default:** 256 MB

**Impact:**

- Keep data structures lean
- Stream large responses
- Avoid loading large files entirely into memory

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ Memory intensive
const bigArray = new Array(10000000).fill('data')

// ✅ Memory efficient
const data = await kv.get('data')
res.json(data)
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ Memory intensive
const bigArray = new Array(10000000).fill('data')

// ✅ Memory efficient
const data = await kv.get('data')
res.json(data)
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ Memory intensive
var bigArray = Enumerable.Repeat("data", 10_000_000).ToArray();

// ✅ Memory efficient
var kv = new KeyValueStore();
var data = await kv.Get("data");
res.Json(data as JsonNode ?? new JsonObject());
```

</TabItem>
</Tabs>

### CPU Limitations

Functions run in a shared environment with CPU throttling.

**Impact:**

- CPU-intensive operations may be slow
- Keep computations light
- Offload heavy processing to external services

## Timing Restrictions

### No Persistent Timers

Timers do not persist across function invocations.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ This won't work across invocations
setTimeout(() => {
  console.log('This runs only during current invocation')
}, 5000)
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ This won't work across invocations
setTimeout(() => {
  console.log('This runs only during current invocation')
}, 5000)
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ This won't work across invocations
var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
await Task.Delay(5000, cts.Token); // Only runs during current invocation
```

</TabItem>
</Tabs>

**Workaround:**
Use the scheduler service for recurring tasks.

### Time-based Operations

Use `Date.now()` or `new Date()` for timestamps. High-resolution timing is limited.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Available
const now = Date.now()
const date = new Date()

// ⚠️ Limited precision
console.time('operation')
// ... operation
console.timeEnd('operation')
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Available
const now = Date.now()
const date = new Date()

// ⚠️ Limited precision
console.time('operation')
// ... operation
console.timeEnd('operation')
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ✅ Available
var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
var date = DateTime.UtcNow;

// ⚠️ Limited precision
var sw = System.Diagnostics.Stopwatch.StartNew();
// ... operation
sw.Stop();
Console.WriteLine($"operation: {sw.ElapsedMilliseconds}ms");
```

</TabItem>
</Tabs>

## Security Restrictions

### Isolation

Each function runs in an isolated sandbox with no access to:

- Host file system
- Other functions' data
- Shared memory
- System resources

### Environment Variables

Environment variables are read-only and configured per function version.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Read environment variables
const apiKey = process.env.API_KEY

// ❌ Cannot modify
process.env.API_KEY = 'new-key' // No effect
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Read environment variables
const apiKey = process.env.API_KEY

// ❌ Cannot modify
process.env.API_KEY = 'new-key' // No effect
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ✅ Read environment variables
var apiKey = Environment.GetEnvironmentVariable("API_KEY");

// ❌ Cannot modify
Environment.SetEnvironmentVariable("API_KEY", "new-key"); // No effect
```

</TabItem>
</Tabs>

### No Reflection

Limited access to sandbox internals and introspection capabilities.

## Global Scope Limitations

### No Global State Persistence

Global variables do not persist between invocations.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
let counter = 0 // Reset on each invocation

export default function handler(req, res) {
  counter++
  res.json({ count: counter }) // Always returns 1
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
let counter = 0 // Reset on each invocation

export default function handler(req: any, res: any) {
  counter++
  res.json({ count: counter }) // Always returns 1
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// Static fields are reset on each invocation
static int counter = 0;

[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    counter++;
    res.Json(new JsonObject { ["count"] = counter }); // Always returns 1
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

**Workaround:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Use KV store for state
export default async function handler(req, res) {
  let counter = (await kv.get('counter')) || 0
  counter++
  await kv.set('counter', counter)
  res.json({ count: counter })
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Use KV store for state
export default async function handler(req: any, res: any) {
  let counter = ((await kv.get('counter')) as number) || 0
  counter++
  await kv.set('counter', counter)
  res.json({ count: counter })
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ✅ Use KV store for state
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    var raw = await kv.Get("counter");
    var counter = raw is long n ? (int)n : 0;
    counter++;
    await kv.Set("counter", counter);
    res.Json(new JsonObject { ["count"] = counter });
}
```

</TabItem>
</Tabs>

### Module Caching

Modules are not cached across invocations (unlike standard Node.js).

## Working with Limitations

### Design Patterns

**Stateless Functions:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Don't rely on state
export default function handler(req, res) {
  const result = processRequest(req.body)
  res.json(result)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Don't rely on state
export default function handler(req: any, res: any) {
  const result = processRequest(req.body)
  res.json(result)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
[EntryPoint]
public static Task Handler(InvokeRequest req, InvokeResponse res)
{
    // ✅ Don't rely on state
    var result = ProcessRequest(req.Body);
    res.Json(result);
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

**External State:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Use KV store for state
export default async function handler(req, res) {
  const state = await kv.get('state')
  const newState = updateState(state, req.body)
  await kv.set('state', newState)
  res.json(newState)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Use KV store for state
export default async function handler(req: any, res: any) {
  const state = await kv.get('state')
  const newState = updateState(state, req.body)
  await kv.set('state', newState)
  res.json(newState)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ✅ Use KV store for state
[EntryPoint]
public static async Task Handler(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    var state = await kv.Get("state") as JsonNode;
    var newState = UpdateState(state, req.Body);
    await kv.Set("state", newState?.ToJsonString());
    res.Json(newState ?? new JsonObject());
}
```

</TabItem>
</Tabs>

**API-First:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Use external services for heavy work
const result = await fetch('https://api.service.com/process', {
  method: 'POST',
  body: JSON.stringify(req.body)
})
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Use external services for heavy work
const result = await fetch('https://api.service.com/process', {
  method: 'POST',
  body: JSON.stringify(req.body)
})
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ✅ Use external services for heavy work
using var http = new HttpClient();
var content = new StringContent(
    System.Text.Json.JsonSerializer.Serialize(req.Body),
    System.Text.Encoding.UTF8,
    "application/json"
);
var result = await http.PostAsync("https://api.service.com/process", content);
```

</TabItem>
</Tabs>

**Stream Large Data:**

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ✅ Stream responses
res.type('application/json')
res.write('[')
for await (const item of getItems()) {
  res.write(JSON.stringify(item) + ',')
}
res.write(']')
res.end()
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ✅ Stream responses
res.type('application/json')
res.write('[')
for await (const item of getItems()) {
  res.write(JSON.stringify(item) + ',')
}
res.write(']')
res.end()
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ✅ Build response as JsonArray (InvokeResponse sends a complete response)
var items = new JsonArray();
await foreach (var item in GetItemsAsync())
    items.Add(item);
res.Json(items);
```

</TabItem>
</Tabs>

## Next Steps

- [Best Practices](/docs/advanced/best-practices) - Recommended patterns
- [KV Store API (Bun)](/docs/api/bun/kv-store) - State management (JavaScript/TypeScript)
- [KV Store API (.NET)](/docs/api/dotnet/kv-store) - State management (C#)
- [Global APIs (Bun)](/docs/api/bun/globals) - Available APIs for JavaScript/TypeScript
- [.NET API Reference](/docs/api/dotnet/overview) - Available APIs for C#

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Function Anatomy

Learn about the structure and components of an Invoke function.

## Simple Function

The most basic function exports a single handler that receives a request and sends a response.

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  res.json({ message: 'Hello, World!' })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  res.json({ message: 'Hello, World!' })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["message"] = "Hello, World!" });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Export Formats (Bun)

JavaScript and TypeScript support several export styles:

```javascript
// Standard function
export default function handler(req, res) { res.json({ ok: true }) }

// Arrow function
export default (req, res) => { res.json({ ok: true }) }

// Async function
export default async function handler(req, res) {
  const data = await fetch('https://api.example.com/data').then(r => r.json())
  res.json(data)
}

// Async arrow
export default async (req, res) => {
  const result = await someAsyncOperation()
  res.json(result)
}
```

## Multi-Route App (Router)

For functions that handle multiple routes, export a `Router` instance (Bun) or use attribute-based routing (C#).

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const router = new Router()

router.get('/', (req, res) => {
  res.json({ message: 'Hello' })
})

router.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id })
})

router.post('/users', async (req, res) => {
  const user = await createUser(req.body)
  res.status(201).json(user)
})

// Catch unmatched routes
router.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

export default router
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const router = new Router()

router.get('/', (req: InvokeRequest, res: InvokeResponse) => {
  res.json({ message: 'Hello' })
})

router.get('/users/:id', (req: InvokeRequest, res: InvokeResponse) => {
  res.json({ id: req.params.id })
})

router.post('/users', async (req: InvokeRequest, res: InvokeResponse) => {
  res.status(201).json(req.body)
})

router.use((req: InvokeRequest, res: InvokeResponse) => {
  res.status(404).json({ error: 'Not found' })
})

export default router
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    [HttpGet("/")]
    public Task Index(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["message"] = "Hello" });
        return Task.CompletedTask;
    }

    [HttpGet("/users/:id")]
    public Task GetUser(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["id"] = req.Params["id"] });
        return Task.CompletedTask;
    }

    [HttpPost("/users")]
    public Task CreateUser(InvokeRequest req, InvokeResponse res)
    {
        res.Status(201).Json(req.Body);
        return Task.CompletedTask;
    }
}
```

See the [Router API (.NET)](/docs/api/dotnet/router) for the full attribute reference.

  </TabItem>
</Tabs>

See the [Router API (Bun)](/docs/api/bun/router) for complete Bun/JS routing documentation.

## Realtime Handler

For Socket.IO-style event-driven functions:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', function () {
  ns.socket.join('lobby')
  ns.socket.emit('welcome', { message: 'Hello!' })
})

ns.socket.on('message', function (data) {
  ns.socket.to('lobby').emit('message', { from: ns.socket.id, text: data.text })
})

ns.socket.on('$disconnect', function (reason) {
  console.log('Disconnected:', ns.socket.id, reason)
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', function () {
  ns.socket.join('lobby')
  ns.socket.emit('welcome', { message: 'Hello!' })
})

ns.socket.on('message', function (data: { text: string }) {
  ns.socket.to('lobby').emit('message', { from: ns.socket.id, text: data.text })
})

ns.socket.on('$disconnect', function (reason: string) {
  console.log('Disconnected:', ns.socket.id, reason)
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
    public App()
    {
        Namespace = "/chat";
    }

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode arg)
    {
        await Emit("welcome", new JsonObject { ["message"] = "Hello!" });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        var text = arg["text"]?.GetValue<string>() ?? "";
        await To("lobby").Emit("message", new JsonObject
        {
            ["from"] = SocketId,
            ["text"] = text
        });
    }

    [RealtimeEvent("$disconnect")]
    public async Task OnDisconnect(JsonNode arg)
    {
        Console.WriteLine($"Disconnected: {SocketId}");
    }
}
```

See the [Realtime API (.NET)](/docs/api/dotnet/realtime) for the full reference.

  </TabItem>
</Tabs>

See the [Realtime API (Bun)](/docs/api/bun/realtime) for complete Bun/JS realtime documentation.

## Request Object

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  console.log(req.method) // 'GET', 'POST', etc.
  console.log(req.path) // '/some/path'
  console.log(req.query) // { key: 'value' }
  console.log(req.body) // Parsed JSON/form data
  console.log(req.headers) // Request headers
  console.log(req.cookies) // Parsed cookies
}
```

See the [Request API (Bun)](/docs/api/bun/request) for complete documentation.

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  console.log(req.method) // 'GET', 'POST', etc.
  console.log(req.path) // '/some/path'
  console.log(req.query) // { key: 'value' }
  console.log(req.body) // Parsed JSON/form data
  console.log(req.headers) // Request headers
  console.log(req.cookies) // Parsed cookies
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    Console.WriteLine(req.Method);    // "GET", "POST", etc.
    Console.WriteLine(req.Path);      // "/some/path"
    var q = req.Query["key"];         // query string
    var body = req.Body;              // JsonNode?
    var ct = req.GetHeader("content-type");
    var cookie = req.Cookies["session"];
    return Task.CompletedTask;
}
```

See the [Request API (.NET)](/docs/api/dotnet/request) for complete documentation.

  </TabItem>
</Tabs>

## Response Object

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  res.json({ success: true }) // JSON response
  res.send('Hello World') // Text response
  res.status(201).json({ created: true }) // With status code
  res.sendFile('/path/to/file.pdf') // File response
}
```

See the [Response API (Bun)](/docs/api/bun/response) for complete documentation.

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  res.json({ success: true })
  res.send('Hello World')
  res.status(201).json({ created: true })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    res.Status(200).Json(new JsonObject { ["success"] = true });  // JSON
    res.Status(200).Send("Hello World");                          // Text
    res.Status(201).Json(new JsonObject { ["created"] = true });  // With status
    res.Status(204).End();                                        // No body
    return Task.CompletedTask;
}
```

See the [Response API (.NET)](/docs/api/dotnet/response) for complete documentation.

  </TabItem>
</Tabs>

## Using Modules / Packages

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

Standard Node.js-compatible modules are available via import:

```javascript
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export default function handler(req, res) {
  const hash = crypto.createHash('sha256').update('data').digest('hex')
  const content = fs.readFileSync(path.join(__dirname, 'data.txt'), 'utf8')
  res.json({ hash, content })
}
```

Available built-in modules include `crypto`, `fs`, `path`, `http`, `https`, `dns`, `zlib`, `stream`, `url`, `util`, `events`, `buffer`, `assert`, `timers`, `tls`, `net`, and more. User code runs on the Bun runtime — see [Bun API Reference](https://bun.com/reference) for full compatibility.

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'
import fs from 'fs'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const hash = crypto.createHash('sha256').update('data').digest('hex')
  res.json({ hash })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

Standard .NET 10 BCL namespaces are available (implicit usings enabled):

```csharp
using System.Security.Cryptography;
using System.Text;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var hash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes("data"))
        ).ToLower();

        res.Status(200).Json(new JsonObject { ["hash"] = hash });
        return Task.CompletedTask;
    }
}
```

Add NuGet packages via `app.csproj` — the platform restores them during build:

```xml
<ItemGroup>
  <PackageReference Include="Invoke.SDK" Version="1.*" />
  <PackageReference Include="Newtonsoft.Json" Version="13.*" />
</ItemGroup>
```

  </TabItem>
</Tabs>

## KV Store

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Global kv (no require needed)
  await kv.set('counter', 42)
  const value = await kv.get('counter')
  res.json({ counter: value })
}
```

See [KV Store API (Bun)](/docs/api/bun/kv-store) for full documentation.

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  await kv.set('counter', 42)
  const value = await kv.get('counter')
  res.json({ counter: value })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        await kv.Set("counter", "42");
        var value = await kv.Get("counter");
        res.Status(200).Json(new JsonObject { ["counter"] = value?.ToString() });
    }
}
```

See [KV Store API (.NET)](/docs/api/dotnet/kv-store) for full documentation.

  </TabItem>
</Tabs>

## Package Structure

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```
function.zip
├── index.js           # Entry point (required)
├── package.json       # Package metadata (required)
├── node_modules/      # Dependencies (optional)
│   └── lodash/
└── lib/               # Helper modules (optional)
    └── utils.js
```

```json title="package.json"
{
  "name": "my-function",
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```
function.zip
├── index.ts           # Entry point (required)
├── tsconfig.json
├── package.json
└── node_modules/
```

```json title="package.json"
{
  "name": "my-function",
  "type": "module",
  "main": "index.ts",
  "devDependencies": {
    "invoke-types": "*",
    "typescript": "^5.0.0"
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```
function.zip
├── Function.cs        # Entry point (required)
└── app.csproj         # Project file (required)
```

```xml title="app.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <PublishAot>true</PublishAot>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Invoke.SDK" Version="1.*" />
  </ItemGroup>
</Project>
```

The platform compiles this to a Native AOT binary — no local `dotnet publish` required.

  </TabItem>
</Tabs>

## Error Handling

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.example.com/data')
    if (!response.ok) {
      return res.status(response.status).json({ error: 'External API error' })
    }
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Function error:', error)
    res.status(500).json({ error: 'Internal error', message: error.message })
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  try {
    const response = await fetch('https://api.example.com/data')
    if (!response.ok) {
      return res.status(response.status).json({ error: 'External API error' })
    }
    const data = await response.json()
    res.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Internal error', message })
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        try
        {
            using var http = new HttpClient();
            var response = await http.GetAsync("https://api.example.com/data");
            if (!response.IsSuccessStatusCode)
            {
                res.Status((int)response.StatusCode)
                   .Json(new JsonObject { ["error"] = "External API error" });
                return;
            }
            var json = await response.Content.ReadAsStringAsync();
            res.Status(200).Type("application/json").Send(json);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Function error: {ex}");
            res.Status(500).Json(new JsonObject
            {
                ["error"] = "Internal error",
                ["message"] = ex.Message
            });
        }
    }
}
```

  </TabItem>
</Tabs>

## Next Steps

- [Runtimes & Languages](/docs/getting-started/runtimes) - Language comparison and project structure
- [Deploying Functions](/docs/getting-started/deploying) - Learn deployment options
- [Bun API Reference](/docs/api/bun/globals) - Explore available Bun/JS APIs
- [.NET API Reference](/docs/api/dotnet/overview) - Explore available C# APIs
- [Examples](/docs/examples/hello-world) - See real-world examples

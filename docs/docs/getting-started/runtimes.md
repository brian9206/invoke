import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Runtimes & Languages

Invoke supports multiple languages and runtimes. Every function you create targets one language and runtime combination.

## Supported Runtimes

| Language   | Runtime             | SDK / Package                                                   |
| ---------- | ------------------- | --------------------------------------------------------------- |
| JavaScript | Bun                 | Built-in globals (`kv`, `fetch`, `Router`, `RealtimeNamespace`) |
| TypeScript | Bun                 | `invoke-types` (type definitions only)                          |
| C#         | .NET 10 (NativeAOT) | `Invoke.SDK` NuGet package                                      |

## Function Types

Each language supports three function types:

| Type                 | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| **Simple Function**  | Handles all requests with a single entry point handler               |
| **Multi-Route App**  | Handles multiple routes with a router (HTTP method + path matching)  |
| **Realtime Handler** | Handles Socket.IO-style events over a persistent WebSocket namespace |

## Function Signatures

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

### Simple Function

```javascript
export default async function handler(req, res) {
  res.json({ message: 'Hello, World!' })
}
```

### Multi-Route App

```javascript
const router = new Router()

router.get('/', (req, res) => res.json({ ok: true }))
router.get('/users/:id', (req, res) => res.json({ id: req.params.id }))
router.post('/users', async (req, res) => res.status(201).json(req.body))

export default router
```

### Realtime Handler

```javascript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', function () {
  ns.socket.join('lobby')
})

ns.socket.on('message', function (data) {
  ns.socket.to('lobby').emit('message', data)
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

### Simple Function

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  res.json({ message: 'Hello, World!' })
}
```

### Multi-Route App

```typescript
const router = new Router()

router.get('/', (req: InvokeRequest, res: InvokeResponse) => res.json({ ok: true }))
router.get('/users/:id', (req: InvokeRequest, res: InvokeResponse) => res.json({ id: req.params.id }))
router.post('/users', async (req: InvokeRequest, res: InvokeResponse) => res.status(201).json(req.body))

export default router
```

### Realtime Handler

```typescript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', function () {
  ns.socket.join('lobby')
})

ns.socket.on('message', function (data: { text: string }) {
  ns.socket.to('lobby').emit('message', data)
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

### Simple Function

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

### Multi-Route App

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    [HttpGet("/")]
    public Task Index(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["ok"] = true });
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

### Realtime Handler

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
        await To("lobby").Emit("joined", new JsonObject { ["id"] = SocketId });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        await To("lobby").Emit("message", arg);
    }
}
```

  </TabItem>
</Tabs>

## Project Structure

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```
my-function/
├── index.js        # Entry point (exports default handler or router)
└── package.json    # Package config (type: "module")
```

**`package.json`:**

```json
{
  "name": "my-function",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js"
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```
my-function/
├── index.ts        # Entry point
├── tsconfig.json   # TypeScript config
└── package.json    # Package config
```

**`package.json`:**

```json
{
  "name": "my-function",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "devDependencies": {
    "invoke-types": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```
my-function/
├── Function.cs     # Entry point (or App.cs for router/realtime)
└── app.csproj      # .NET project file
```

**`app.csproj`:**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <PublishAot>true</PublishAot>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Invoke.SDK" Version="1.*" />
  </ItemGroup>
</Project>
```

  </TabItem>
</Tabs>

## Choosing a Runtime

| Scenario                                 | Recommended      |
| ---------------------------------------- | ---------------- |
| Quick scripting, prototyping             | JavaScript (Bun) |
| Type-safe functions, npm ecosystem       | TypeScript (Bun) |
| High-performance, type-safe, low latency | C# (.NET)        |

See the [API Reference](/docs/api/bun/globals) for full Bun API documentation, or the [.NET API Reference](/docs/api/dotnet/overview) for the C# SDK.

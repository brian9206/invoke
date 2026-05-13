---
sidebar_position: 1
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Welcome to Invoke

**Invoke** is a modern serverless function management platform that lets you deploy and execute custom functions in a secure, isolated sandbox environment.

## What is Invoke?

Invoke lets you write serverless functions in **JavaScript**, **TypeScript**, or **C#**, with access to a rich set of built-in APIs. Your functions run in sandboxed environments with:

- **Multi-language support**: JavaScript, TypeScript (Bun runtime), and C# (.NET 10 NativeAOT)
- **Express.js-compatible APIs**: Familiar `req` and `res` objects (JS/TS) or `InvokeRequest`/`InvokeResponse` (C#)
- **Persistent Storage**: Built-in key-value store with TTL support
- **Realtime Support**: Socket.IO-style real-time communication via `RealtimeNamespace`
- **Package Support**: npm packages (JS/TS) or NuGet packages (C#)

## Quick Example

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default async function handler(req, res) {
  const name = req.query.name || 'World'
  const id = crypto.randomUUID()

  await kv.set(`user:${id}`, { name, timestamp: Date.now() })

  res.json({ message: `Hello, ${name}!`, id })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const name = (req.query.name as string) || 'World'
  const id = crypto.randomUUID()

  await kv.set(`user:${id}`, { name, timestamp: Date.now() })

  res.json({ message: `Hello, ${name}!`, id })
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
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var name = req.Query.TryGetValue("name", out var n) ? n : "World";
        var id = Guid.NewGuid().ToString();

        var kv = new KeyValueStore();
        await kv.Set($"user:{id}", new JsonObject { ["name"] = name, ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });

        res.Status(200).Json(new JsonObject { ["message"] = $"Hello, {name}!", ["id"] = id });
    }
}
```

  </TabItem>
</Tabs>

## Key Features

### 🔒 Secure Execution

Functions run in isolated sandbox environments with controlled access to system resources.

### 🌐 HTTP/HTTPS Support

Make external API calls using `fetch`, `http`, or `https` modules.

### 💾 Built-in KV Store

Persistent key-value storage with automatic TTL management.

### 📦 Package Support

Use npm packages (`node_modules`) in JavaScript/TypeScript functions, or NuGet packages (`Invoke.SDK`) in C# functions.

### ⚡ High Performance

Efficient execution with caching and resource pooling.

### 🛠️ Powerful CLI

Manage functions, versions, environment variables, and more from the command line.

## Management Options

### Web Admin Panel

Access the full-featured web interface to manage functions, view logs, and monitor performance.

### Command Line Interface (CLI)

Use the Invoke CLI for powerful command-line management:

```bash
# Create and deploy a function
invoke function:create --name my-api ./my-function

# Invoke a function
invoke function:invoke my-api --method POST --data '{"hello": "world"}'

# View execution logs
invoke function:logs my-api --status error --limit 10
```

Learn more in the [CLI Documentation](/docs/cli/installation).

## What You'll Learn

- [Quick Start](/docs/getting-started/quick-start) - Create your first function in 5 minutes
- [Runtimes & Languages](/docs/getting-started/runtimes) - Language and runtime overview
- [CLI Reference](/docs/cli/installation) - Command-line interface documentation
- [Bun API Reference](/docs/api/bun/globals) - JS/TS API documentation
- [.NET API Reference](/docs/api/dotnet/overview) - C# SDK documentation
- [Guides](/docs/guides/http-requests) - Step-by-step tutorials for common tasks
- [Examples](/docs/examples/hello-world) - Real-world function examples

## Ready to Get Started?

Jump into the [Quick Start Guide](/docs/getting-started/quick-start) to create your first Invoke function!

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Hello World Example

The simplest Invoke function examples.

## Basic Hello World

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  res.json({
    message: 'Hello World!',
    timestamp: new Date().toISOString()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  res.json({
    message: 'Hello World!',
    timestamp: new Date().toISOString()
  })
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
        res.Status(200).Json(new JsonObject
        {
            ["message"]   = "Hello World!",
            ["timestamp"] = DateTime.UtcNow.ToString("O")
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

**Test:**

```bash
curl http://<your invoke-execution URL>/invoke/{functionId}
```

**Response:**

```json
{
  "message": "Hello World!",
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

## With Query Parameters

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const name = req.query.name || 'World'
  const greeting = req.query.greeting || 'Hello'

  res.json({
    message: `${greeting}, ${name}!`,
    timestamp: new Date().toISOString()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const name = (req.query.name as string) || 'World'
  const greeting = (req.query.greeting as string) || 'Hello'

  res.json({
    message: `${greeting}, ${name}!`,
    timestamp: new Date().toISOString()
  })
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
        var name = req.Query.TryGetValue("name", out var n) ? n : "World";
        var greeting = req.Query.TryGetValue("greeting", out var g) ? g : "Hello";

        res.Status(200).Json(new JsonObject
        {
            ["message"]   = $"{greeting}, {name}!",
            ["timestamp"] = DateTime.UtcNow.ToString("O")
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

**Test:**

```bash
curl "http://<your invoke-execution URL>/invoke/{functionId}?name=Alice&greeting=Hi"
```

**Response:**

```json
{
  "message": "Hi, Alice!",
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

## Async Hello World

```javascript
export default async function handler(req, res) {
  // Simulate async operation
  await sleep(100)

  res.json({
    message: 'Hello from async function!',
    timestamp: new Date().toISOString()
  })
}
```

## Request Information

```javascript
export default function handler(req, res) {
  res.json({
    message: 'Hello World!',
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        userAgent: req.get('user-agent'),
        host: req.get('host')
      }
    },
    timestamp: new Date().toISOString()
  })
}
```

## Different Response Formats

### JSON

```javascript
export default function handler(req, res) {
  res.json({ message: 'Hello World!' })
}
```

### Plain Text

```javascript
export default function handler(req, res) {
  res.send('Hello World!')
}
```

### HTML

```javascript
export default function handler(req, res) {
  res.type('html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Hello</title></head>
        <body>
            <h1>Hello World!</h1>
            <p>Timestamp: ${new Date().toISOString()}</p>
        </body>
        </html>
    `)
}
```

## Next Steps

- [REST API Example](/docs/examples/rest-api) - Build a full API
- [Function Anatomy](/docs/getting-started/function-anatomy) - Learn function structure
- [Request Object](/docs/api/bun/request) - Request API reference (Bun)

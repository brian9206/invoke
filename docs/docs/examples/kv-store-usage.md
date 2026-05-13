import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# KV Store Usage Example

Practical examples of using the built-in key-value store.

## Session Management

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const sessionId = req.cookies.sessionId || crypto.randomUUID()
  const sessionKey = `session:${sessionId}`

  let session = (await kv.get(sessionKey)) || {
    id: sessionId,
    createdAt: Date.now(),
    data: {}
  }

  session.lastAccess = Date.now()
  session.visits = (session.visits || 0) + 1

  await kv.set(sessionKey, session, 3600)

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 3600000 })
  res.json({
    success: true,
    session: {
      id: session.id,
      visits: session.visits,
      createdAt: new Date(session.createdAt).toISOString(),
      lastAccess: new Date(session.lastAccess).toISOString()
    }
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
interface Session {
  id: string
  createdAt: number
  lastAccess: number
  visits: number
  data: Record<string, unknown>
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const sessionId = (req.cookies.sessionId as string) || crypto.randomUUID()
  const sessionKey = `session:${sessionId}`

  let session: Session =
    (await kv.get(sessionKey)) ??
    ({
      id: sessionId,
      createdAt: Date.now(),
      data: {}
    } as any)

  session.lastAccess = Date.now()
  session.visits = (session.visits || 0) + 1

  await kv.set(sessionKey, session, 3600)

  res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 3600000 })
  res.json({
    success: true,
    session: {
      id: session.id,
      visits: session.visits,
      createdAt: new Date(session.createdAt).toISOString(),
      lastAccess: new Date(session.lastAccess).toISOString()
    }
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
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        var sessionId = req.Cookies.TryGetValue("sessionId", out var sid) ? sid : Guid.NewGuid().ToString();
        var sessionKey = $"session:{sessionId}";

        var session = await kv.Get(sessionKey) as JsonObject ?? new JsonObject
        {
            ["id"]         = sessionId,
            ["createdAt"]  = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["visits"]     = 0
        };

        session["lastAccess"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        session["visits"] = (session["visits"]?.GetValue<int>() ?? 0) + 1;

        await kv.Set(sessionKey, session, 3600000);

        res.SetHeader("Set-Cookie", $"sessionId={sessionId}; HttpOnly; Max-Age=3600");
        res.Status(200).Json(new JsonObject
        {
            ["success"] = true,
            ["session"] = new JsonObject
            {
                ["id"]         = sessionId,
                ["visits"]     = session["visits"],
                ["lastAccess"] = DateTimeOffset.UtcNow.ToString("O")
            }
        });
    }
}
```

  </TabItem>
</Tabs>

## Rate Limiting

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const identifier = req.ip || req.headers['x-forwarded-for']
  const rateLimitKey = `ratelimit:${identifier}`
  const limit = 10
  const windowSeconds = 60

  const current = (await kv.get(rateLimitKey)) || 0

  if (current >= limit) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: windowSeconds })
  }

  await kv.set(rateLimitKey, current + 1, windowSeconds)
  res.setHeader('X-RateLimit-Limit', limit)
  res.setHeader('X-RateLimit-Remaining', limit - current - 1)
  res.json({ success: true, requestsRemaining: limit - current - 1 })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const identifier = req.ip || (req.headers['x-forwarded-for'] as string)
  const rateLimitKey = `ratelimit:${identifier}`
  const limit = 10
  const windowSeconds = 60

  const current = ((await kv.get(rateLimitKey)) as number) || 0

  if (current >= limit) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: windowSeconds })
  }

  await kv.set(rateLimitKey, current + 1, windowSeconds)
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(limit - current - 1))
  res.json({ success: true, requestsRemaining: limit - current - 1 })
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
        var kv = new KeyValueStore();
        var identifier = req.Ip ?? req.GetHeader("x-forwarded-for") ?? "unknown";
        var rateLimitKey = $"ratelimit:{identifier}";
        const int limit = 10;
        const int windowSeconds = 60;

        var current = (int?)((await kv.Get(rateLimitKey)) as JsonValue)?.GetValue<int>() ?? 0;

        if (current >= limit)
        {
            res.Status(429).Json(new JsonObject { ["error"] = "Too many requests", ["retryAfter"] = windowSeconds });
            return;
        }

        await kv.Set(rateLimitKey, current + 1, windowSeconds * 1000);
        res.SetHeader("X-RateLimit-Limit", limit.ToString());
        res.SetHeader("X-RateLimit-Remaining", (limit - current - 1).ToString());
        res.Status(200).Json(new JsonObject { ["success"] = true, ["requestsRemaining"] = limit - current - 1 });
    }
}
```

  </TabItem>
</Tabs>

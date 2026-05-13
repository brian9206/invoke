import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Webhook Handler Example

Process incoming webhooks from external services.

## Basic Webhook Handler

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { event, data } = req.body
  console.log('Webhook received:', { event, timestamp: new Date().toISOString() })

  res.status(200).json({
    success: true,
    message: 'Webhook received',
    eventId: crypto.randomUUID()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { event, data } = req.body as { event: string; data: unknown }
  console.log('Webhook received:', { event, timestamp: new Date().toISOString() })

  res.status(200).json({
    success: true,
    message: 'Webhook received',
    eventId: crypto.randomUUID()
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
        if (req.Method != "POST")
        {
            res.Status(405).Json(new JsonObject { ["error"] = "Method not allowed" });
            return Task.CompletedTask;
        }

        var ev = req.Body?["event"]?.GetValue<string>();
        Console.WriteLine($"Webhook received: {ev} at {DateTime.UtcNow:O}");

        res.Status(200).Json(new JsonObject
        {
            ["success"] = true,
            ["message"] = "Webhook received",
            ["eventId"] = Guid.NewGuid().ToString()
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## GitHub Webhook (HMAC verification)

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function verifyGitHubSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const signature = req.headers['x-hub-signature-256']
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  if (!signature || !verifyGitHubSignature(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const { action, repository } = req.body
  res.json({ success: true, action, repo: repository?.full_name })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const signature = req.headers['x-hub-signature-256'] as string
  const secret = process.env.GITHUB_WEBHOOK_SECRET!

  if (!signature || !verifyGitHubSignature(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const body = req.body as { action: string; repository?: { full_name: string } }
  res.json({ success: true, action: body.action, repo: body.repository?.full_name })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        if (req.Method != "POST")
        {
            res.Status(405).Json(new JsonObject { ["error"] = "Method not allowed" });
            return Task.CompletedTask;
        }

        var signature = req.GetHeader("x-hub-signature-256");
        var secret = Environment.GetEnvironmentVariable("GITHUB_WEBHOOK_SECRET") ?? "";
        var payload = req.Body?.ToJsonString() ?? "";

        if (string.IsNullOrEmpty(signature) || !VerifySignature(payload, signature, secret))
        {
            res.Status(401).Json(new JsonObject { ["error"] = "Invalid signature" });
            return Task.CompletedTask;
        }

        var action = req.Body?["action"]?.GetValue<string>();
        var repo = req.Body?["repository"]?["full_name"]?.GetValue<string>();

        res.Status(200).Json(new JsonObject { ["success"] = true, ["action"] = action, ["repo"] = repo });
        return Task.CompletedTask;
    }

    private static bool VerifySignature(string payload, string signature, string secret)
    {
        var key = Encoding.UTF8.GetBytes(secret);
        var data = Encoding.UTF8.GetBytes(payload);
        var hash = HMACSHA256.HashData(key, data);
        var expected = "sha256=" + Convert.ToHexString(hash).ToLower();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(signature),
            Encoding.UTF8.GetBytes(expected));
    }
}
```

  </TabItem>
</Tabs>

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Environment Variables Guide

Learn how to use environment variables in your Invoke functions.

## Accessing Environment Variables

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const apiKey = process.env.API_KEY
  const debug = process.env.DEBUG === 'true'
  const port = parseInt(process.env.PORT) || 3000

  res.json({ apiKey, debug, port })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const apiKey = process.env.API_KEY
  const debug = process.env.DEBUG === 'true'
  const port = parseInt(process.env.PORT ?? '3000') || 3000

  res.json({ apiKey, debug, port })
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
        var apiKey = Environment.GetEnvironmentVariable("API_KEY");
        var debug  = Environment.GetEnvironmentVariable("DEBUG") == "true";
        var port   = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var p) ? p : 3000;

        res.Status(200).Json(new JsonObject
        {
            ["apiKey"] = apiKey,
            ["debug"]  = debug,
            ["port"]   = port
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Setting via Admin Panel

1. Navigate to your function in the admin panel
2. Click **Environment Variables**
3. Add key-value pairs:
   - `API_KEY` = `your-secret-key`
   - `DEBUG` = `true`
   - `DATABASE_URL` = `postgresql://...`
4. Click **Save**

## Setting via CLI

```bash
invoke function:deploy \
  --project my-project \
  --name my-function \
  --env API_KEY=secret123 \
  --env DEBUG=true \
  --env MAX_RETRIES=3
```

## Common Patterns

### API Configuration

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const apiUrl = process.env.API_URL || 'https://api.example.com'
  const apiKey = process.env.API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'API_KEY not configured' })
  }

  const response = await fetch(`${apiUrl}/data`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const data = await response.json()
  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const apiUrl = process.env.API_URL ?? 'https://api.example.com'
  const apiKey = process.env.API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'API_KEY not configured' })
  }

  const response = await fetch(`${apiUrl}/data`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const data = await response.json()
  res.json(data)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Net.Http;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var apiUrl = Environment.GetEnvironmentVariable("API_URL") ?? "https://api.example.com";
        var apiKey = Environment.GetEnvironmentVariable("API_KEY");

        if (string.IsNullOrEmpty(apiKey))
        {
            res.Status(500).Json(new JsonObject { ["error"] = "API_KEY not configured" });
            return;
        }

        _http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        var json = await _http.GetStringAsync($"{apiUrl}/data");
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

### Database Connection

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }

  res.json({ configured: true })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const dbConfig = {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }

  res.json({ configured: true })
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
        var dbConfig = new
        {
            host     = Environment.GetEnvironmentVariable("DB_HOST")     ?? "localhost",
            port     = int.TryParse(Environment.GetEnvironmentVariable("DB_PORT"), out var p) ? p : 5432,
            database = Environment.GetEnvironmentVariable("DB_NAME"),
            user     = Environment.GetEnvironmentVariable("DB_USER"),
            password = Environment.GetEnvironmentVariable("DB_PASSWORD")
        };

        res.Status(200).Json(new JsonObject { ["configured"] = true });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Feature Flags

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const features = {
    newUI: process.env.FEATURE_NEW_UI === 'true',
    betaFeatures: process.env.FEATURE_BETA === 'true',
    maintenance: process.env.MAINTENANCE_MODE === 'true'
  }

  if (features.maintenance) {
    return res.status(503).json({ error: 'Under maintenance' })
  }

  res.json({ features })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const features = {
    newUI: process.env.FEATURE_NEW_UI === 'true',
    betaFeatures: process.env.FEATURE_BETA === 'true',
    maintenance: process.env.MAINTENANCE_MODE === 'true'
  }

  if (features.maintenance) {
    return res.status(503).json({ error: 'Under maintenance' })
  }

  res.json({ features })
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
        bool Flag(string name) => Environment.GetEnvironmentVariable(name) == "true";

        var maintenance = Flag("MAINTENANCE_MODE");
        if (maintenance)
        {
            res.Status(503).Json(new JsonObject { ["error"] = "Under maintenance" });
            return Task.CompletedTask;
        }

        res.Status(200).Json(new JsonObject
        {
            ["features"] = new JsonObject
            {
                ["newUI"]        = Flag("FEATURE_NEW_UI"),
                ["betaFeatures"] = Flag("FEATURE_BETA"),
                ["maintenance"]  = false
            }
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Environment-Specific Behavior

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const env = process.env.NODE_ENV || 'development'

  const config = {
    production: { apiUrl: 'https://api.production.com', debug: false, cacheTimeout: 3600000 },
    development: { apiUrl: 'http://localhost:3000', debug: true, cacheTimeout: 0 }
  }

  res.json(config[env] || config.development)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const env = process.env.NODE_ENV ?? 'development'

  const config: Record<string, { apiUrl: string; debug: boolean; cacheTimeout: number }> = {
    production: { apiUrl: 'https://api.production.com', debug: false, cacheTimeout: 3600000 },
    development: { apiUrl: 'http://localhost:3000', debug: true, cacheTimeout: 0 }
  }

  res.json(config[env] ?? config.development)
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
        // .NET uses ASPNETCORE_ENVIRONMENT; Invoke also accepts NODE_ENV
        var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
               ?? Environment.GetEnvironmentVariable("NODE_ENV")
               ?? "Development";

        var isProd = env.Equals("Production", StringComparison.OrdinalIgnoreCase);

        res.Status(200).Json(new JsonObject
        {
            ["apiUrl"]       = isProd ? "https://api.production.com" : "http://localhost:3000",
            ["debug"]        = !isProd,
            ["cacheTimeout"] = isProd ? 3600000 : 0
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Type Conversion

### Numbers

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const port = parseInt(process.env.PORT) || 3000
const timeout = parseFloat(process.env.TIMEOUT) || 5.5
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const port = parseInt(process.env.PORT ?? '3000') || 3000
const timeout = parseFloat(process.env.TIMEOUT ?? '5.5') || 5.5
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
var port    = int.TryParse(Environment.GetEnvironmentVariable("PORT"),    out var p) ? p : 3000;
var timeout = double.TryParse(Environment.GetEnvironmentVariable("TIMEOUT"), out var t) ? t : 5.5;
```

  </TabItem>
</Tabs>

### Booleans

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const debug = process.env.DEBUG === 'true'
const enabled = process.env.FEATURE_ENABLED !== 'false' // true by default
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const debug = process.env.DEBUG === 'true'
const enabled = process.env.FEATURE_ENABLED !== 'false'
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
var debug   = Environment.GetEnvironmentVariable("DEBUG") == "true";
var enabled = Environment.GetEnvironmentVariable("FEATURE_ENABLED") != "false"; // true by default
```

  </TabItem>
</Tabs>

### Arrays

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ENV: ALLOWED_ORIGINS=http://localhost:3000,http://example.com
const origins = process.env.ALLOWED_ORIGINS?.split(',') ?? []
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const origins: string[] = process.env.ALLOWED_ORIGINS?.split(',') ?? []
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ENV: ALLOWED_ORIGINS=http://localhost:3000,http://example.com
var origins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries);
```

  </TabItem>
</Tabs>

### JSON

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ENV: CONFIG={"key":"value","enabled":true}
const config = JSON.parse(process.env.CONFIG || '{}')
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
interface AppConfig {
  key?: string
  enabled?: boolean
}
const config: AppConfig = JSON.parse(process.env.CONFIG ?? '{}')
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using System.Text.Json.Nodes;

// ENV: CONFIG={"key":"value","enabled":true}
var config = JsonNode.Parse(Environment.GetEnvironmentVariable("CONFIG") ?? "{}");
```

  </TabItem>
</Tabs>

## Validation

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const requiredEnvVars = ['API_KEY', 'API_URL', 'DATABASE_URL']

export default function handler(req, res) {
  const missing = requiredEnvVars.filter(key => !process.env[key])

  if (missing.length > 0) {
    return res.status(500).json({
      error: 'Missing required environment variables',
      missing
    })
  }

  res.json({ configured: true })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const requiredEnvVars = ['API_KEY', 'API_URL', 'DATABASE_URL'] as const

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const missing = requiredEnvVars.filter(key => !process.env[key])

  if (missing.length > 0) {
    return res.status(500).json({
      error: 'Missing required environment variables',
      missing
    })
  }

  res.json({ configured: true })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly string[] Required = ["API_KEY", "API_URL", "DATABASE_URL"];

    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var missing = Required
            .Where(k => string.IsNullOrEmpty(Environment.GetEnvironmentVariable(k)))
            .ToArray();

        if (missing.Length > 0)
        {
            var arr = new JsonArray();
            foreach (var k in missing) arr.Add(k);
            res.Status(500).Json(new JsonObject
            {
                ["error"]   = "Missing required environment variables",
                ["missing"] = arr
            });
            return Task.CompletedTask;
        }

        res.Status(200).Json(new JsonObject { ["configured"] = true });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

### 1. Never Hardcode Secrets

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ DON'T
const apiKey = 'sk_live_abc123xyz'

// ✅ DO
const apiKey = process.env.API_KEY
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ❌ DON'T
const apiKey = 'sk_live_abc123xyz'

// ✅ DO
const apiKey = process.env.API_KEY
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ❌ DON'T
var apiKey = "sk_live_abc123xyz";

// ✅ DO
var apiKey = Environment.GetEnvironmentVariable("API_KEY");
```

  </TabItem>
</Tabs>

### 2. Provide Defaults

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const timeout = parseInt(process.env.TIMEOUT) || 30000
const maxRetries = parseInt(process.env.MAX_RETRIES) || 3
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const timeout = parseInt(process.env.TIMEOUT ?? '30000') || 30000
const maxRetries = parseInt(process.env.MAX_RETRIES ?? '3') || 3
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
var timeout    = int.TryParse(Environment.GetEnvironmentVariable("TIMEOUT"),     out var t) ? t : 30000;
var maxRetries = int.TryParse(Environment.GetEnvironmentVariable("MAX_RETRIES"), out var r) ? r : 3;
```

  </TabItem>
</Tabs>

### 3. Validate Critical Variables

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
if (!process.env.API_KEY) {
  return res.status(500).json({ error: 'API_KEY required' })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
if (!process.env.API_KEY) {
  return res.status(500).json({ error: 'API_KEY required' })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("API_KEY")))
{
    res.Status(500).Json(new JsonObject { ["error"] = "API_KEY required" });
    return Task.CompletedTask;
}
```

  </TabItem>
</Tabs>

### 4. Use Descriptive Names

```bash
# ❌ Unclear
KEY=...
URL=...

# ✅ Clear
STRIPE_API_KEY=...
DATABASE_URL=...
```

### 5. Document Required Variables

Create a `.env.example` file:

```bash
# API Configuration
API_KEY=your-api-key-here
API_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Features (true/false)
DEBUG=false
FEATURE_NEW_UI=true
```

## Security Considerations

### Don't Log Sensitive Data

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ DON'T
console.log('API Key:', process.env.API_KEY)

// ✅ DO
console.log('API Key configured:', !!process.env.API_KEY)
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ❌ DON'T
console.log('API Key:', process.env.API_KEY)

// ✅ DO
console.log('API Key configured:', !!process.env.API_KEY)
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ❌ DON'T
Console.WriteLine("API Key: " + Environment.GetEnvironmentVariable("API_KEY"));

// ✅ DO
Console.WriteLine("API Key configured: " + !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("API_KEY")));
```

  </TabItem>
</Tabs>

### Don't Return Secrets in Responses

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ DON'T
res.json({ env: process.env })

// ✅ DO
res.json({ configured: !!process.env.API_KEY })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ❌ DON'T
res.json({ env: process.env })

// ✅ DO
res.json({ configured: !!process.env.API_KEY })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ❌ DON'T — never expose all env vars
// res.Status(200).Json(JsonNode.Parse(JsonSerializer.Serialize(Environment.GetEnvironmentVariables())));

// ✅ DO
res.Status(200).Json(new JsonObject
{
    ["configured"] = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("API_KEY"))
});
```

  </TabItem>
</Tabs>

## Next Steps

- [Deploying Functions](/docs/getting-started/deploying) - Setting env vars during deployment
- [Best Practices](/docs/advanced/best-practices) - Security best practices
- [Examples](/docs/examples/hello-world) - Using env vars in examples

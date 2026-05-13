import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# HTTP Requests Guide

Learn how to make HTTP requests from your Invoke functions.

## Overview

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const response = await fetch('https://api.example.com/data')
  const data = await response.json()
  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetch('https://api.example.com/data')
  const data = await response.json()
  res.json(data)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Net.Http;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var json = await _http.GetStringAsync("https://api.example.com/data");
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

## GET Requests

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Simple GET
  const response = await fetch('https://api.github.com/users/octocat')
  const user = await response.json()

  // GET with query parameters
  const params = new URLSearchParams({ q: 'javascript', sort: 'stars', order: 'desc' })
  const searchResponse = await fetch(`https://api.github.com/search/repositories?${params}`)
  const searchResults = await searchResponse.json()

  res.json({ user, searchResults })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetch('https://api.github.com/users/octocat')
  const user = await response.json()

  const params = new URLSearchParams({ q: 'javascript', sort: 'stars', order: 'desc' })
  const searchResponse = await fetch(`https://api.github.com/search/repositories?${params}`)
  const searchResults = await searchResponse.json()

  res.json({ user, searchResults })
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
        // Simple GET
        var userJson = await _http.GetStringAsync("https://api.github.com/users/octocat");

        // GET with query parameters
        var query = System.Web.HttpUtility.ParseQueryString("");
        query["q"] = "javascript"; query["sort"] = "stars"; query["order"] = "desc";
        var searchJson = await _http.GetStringAsync(
            $"https://api.github.com/search/repositories?{query}");

        res.Status(200).Json(new JsonObject
        {
            ["user"]          = JsonNode.Parse(userJson),
            ["searchResults"] = JsonNode.Parse(searchJson)
        });
    }
}
```

  </TabItem>
</Tabs>

## POST Requests

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })
  })
  const data = await response.json()
  res.status(201).json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })
  })
  const data = await response.json()
  res.status(201).json(data)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var payload = new { name = "Alice", email = "alice@example.com" };
        var response = await _http.PostAsJsonAsync("https://api.example.com/users", payload);
        var json = await response.Content.ReadAsStringAsync();
        res.Status(201).Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

## Headers and Authentication

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Bearer token
  const response = await fetch('https://api.example.com/protected', {
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  // API key header
  const keyResponse = await fetch('https://api.example.com/data', {
    headers: {
      'X-API-Key': process.env.API_KEY,
      'X-Request-ID': crypto.randomUUID(),
      'User-Agent': 'Invoke-Function/1.0'
    }
  })

  res.json({ success: true })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetch('https://api.example.com/protected', {
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  const keyResponse = await fetch('https://api.example.com/data', {
    headers: {
      'X-API-Key': process.env.API_KEY ?? '',
      'X-Request-ID': crypto.randomUUID(),
      'User-Agent': 'Invoke-Function/1.0'
    }
  })

  res.json({ success: true })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        // Bearer token
        var request = new HttpRequestMessage(HttpMethod.Get, "https://api.example.com/protected");
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("API_TOKEN"));
        var response = await _http.SendAsync(request);

        // API key header
        var keyRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.example.com/data");
        keyRequest.Headers.Add("X-API-Key", Environment.GetEnvironmentVariable("API_KEY"));
        keyRequest.Headers.Add("X-Request-ID", Guid.NewGuid().ToString());
        keyRequest.Headers.UserAgent.ParseAdd("Invoke-Function/1.0");
        var keyResponse = await _http.SendAsync(keyRequest);

        res.Status(200).Json(new JsonObject { ["success"] = true });
    }
}
```

  </TabItem>
</Tabs>

## PUT / PATCH / DELETE

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const apiUrl = 'https://api.example.com/resource/123'

  const putResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Updated Name' })
  })

  const patchResponse = await fetch(apiUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.com' })
  })

  const deleteResponse = await fetch(apiUrl, { method: 'DELETE' })

  res.json({ put: putResponse.status, patch: patchResponse.status, delete: deleteResponse.status })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const apiUrl = 'https://api.example.com/resource/123'
  const jsonHeaders = { 'Content-Type': 'application/json' }

  const putResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ name: 'Updated Name' })
  })
  const patchResponse = await fetch(apiUrl, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ email: 'new@example.com' })
  })
  const deleteResponse = await fetch(apiUrl, { method: 'DELETE' })

  res.json({ put: putResponse.status, patch: patchResponse.status, delete: deleteResponse.status })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        const string apiUrl = "https://api.example.com/resource/123";

        var put    = await _http.PutAsJsonAsync(apiUrl, new { name = "Updated Name" });
        var patch  = await _http.PatchAsJsonAsync(apiUrl, new { email = "new@example.com" });
        var delete = await _http.DeleteAsync(apiUrl);

        res.Status(200).Json(new JsonObject
        {
            ["put"]    = (int)put.StatusCode,
            ["patch"]  = (int)patch.StatusCode,
            ["delete"] = (int)delete.StatusCode
        });
    }
}
```

  </TabItem>
</Tabs>

## Response Handling

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const response = await fetch('https://api.example.com/data')
  const contentType = response.headers.get('content-type')

  if (!response.ok) {
    return res.status(response.status).json({ error: `HTTP ${response.status}` })
  }

  if (contentType?.includes('application/json')) {
    const data = await response.json()
    res.json(data)
  } else if (contentType?.includes('text/')) {
    const text = await response.text()
    res.send(text)
  } else {
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetch('https://api.example.com/data')
  const contentType = response.headers.get('content-type')

  if (!response.ok) {
    return res.status(response.status).json({ error: `HTTP ${response.status}` })
  }

  if (contentType?.includes('application/json')) {
    const data = await response.json()
    res.json(data)
  } else {
    const text = await response.text()
    res.send(text)
  }
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
        var response = await _http.GetAsync("https://api.example.com/data");
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";

        if (!response.IsSuccessStatusCode)
        {
            res.Status((int)response.StatusCode)
               .Json(new JsonObject { ["error"] = $"HTTP {(int)response.StatusCode}" });
            return;
        }

        if (contentType.Contains("application/json"))
        {
            var json = await response.Content.ReadAsStringAsync();
            res.Type("application/json").Send(json);
        }
        else
        {
            var text = await response.Content.ReadAsStringAsync();
            res.Type(contentType).Send(text);
        }
    }
}
```

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
      const errorData = await response.json().catch(() => ({}))
      return res.status(response.status).json({
        error: 'API request failed',
        status: response.status,
        details: errorData
      })
    }

    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Request failed:', error)
    res.status(500).json({ error: 'Network error', message: error.message })
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
      const errorData = await response.json().catch(() => ({}))
      return res.status(response.status).json({
        error: 'API request failed',
        status: response.status,
        details: errorData
      })
    }

    const data = await response.json()
    res.json(data)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Network error', message: msg })
  }
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
        try
        {
            var response = await _http.GetAsync("https://api.example.com/data");

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                res.Status((int)response.StatusCode).Json(new JsonObject
                {
                    ["error"]   = "API request failed",
                    ["status"]  = (int)response.StatusCode,
                    ["details"] = errorBody
                });
                return;
            }

            var json = await response.Content.ReadAsStringAsync();
            res.Type("application/json").Send(json);
        }
        catch (HttpRequestException ex)
        {
            res.Status(500).Json(new JsonObject
            {
                ["error"]   = "Network error",
                ["message"] = ex.Message
            });
        }
    }
}
```

  </TabItem>
</Tabs>

## Timeout Handling

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch('https://api.example.com/slow', {
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    const data = await response.json()
    res.json(data)
  } catch (error) {
    if (error.name === 'AbortError') {
      res.status(408).json({ error: 'Request timeout' })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch('https://api.example.com/slow', { signal: controller.signal })
    clearTimeout(timeoutId)
    const data = await response.json()
    res.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      res.status(408).json({ error: 'Request timeout' })
    } else {
      res.status(500).json({ error: String(error) })
    }
  }
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
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var http = new HttpClient();

        try
        {
            var json = await http.GetStringAsync("https://api.example.com/slow", cts.Token);
            res.Type("application/json").Send(json);
        }
        catch (OperationCanceledException)
        {
            res.Status(408).Json(new JsonObject { ["error"] = "Request timeout" });
        }
        catch (HttpRequestException ex)
        {
            res.Status(500).Json(new JsonObject { ["error"] = ex.Message });
        }
    }
}
```

  </TabItem>
</Tabs>

## Common Patterns

### Parallel Requests

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const [users, posts, comments] = await Promise.all([
    fetch('https://api.example.com/users').then(r => r.json()),
    fetch('https://api.example.com/posts').then(r => r.json()),
    fetch('https://api.example.com/comments').then(r => r.json())
  ])

  res.json({ users, posts, comments })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const [users, posts, comments] = await Promise.all([
    fetch('https://api.example.com/users').then(r => r.json()),
    fetch('https://api.example.com/posts').then(r => r.json()),
    fetch('https://api.example.com/comments').then(r => r.json())
  ])

  res.json({ users, posts, comments })
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
        var (usersTask, postsTask, commentsTask) = (
            _http.GetStringAsync("https://api.example.com/users"),
            _http.GetStringAsync("https://api.example.com/posts"),
            _http.GetStringAsync("https://api.example.com/comments")
        );

        await Task.WhenAll(usersTask, postsTask, commentsTask);

        res.Status(200).Json(new JsonObject
        {
            ["users"]    = JsonNode.Parse(usersTask.Result),
            ["posts"]    = JsonNode.Parse(postsTask.Result),
            ["comments"] = JsonNode.Parse(commentsTask.Result)
        });
    }
}
```

  </TabItem>
</Tabs>

### Retry with Exponential Backoff

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response
      if (response.status >= 500 && i < retries - 1) {
        await sleep(1000 * Math.pow(2, i))
        continue
      }
      return response
    } catch (error) {
      if (i === retries - 1) throw error
      await sleep(1000 * Math.pow(2, i))
    }
  }
}

export default async function handler(req, res) {
  const response = await fetchWithRetry('https://api.example.com/data')
  const data = await response.json()
  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) return response
      if (i < retries - 1) await sleep(1000 * Math.pow(2, i))
    } catch (error) {
      if (i === retries - 1) throw error
      await sleep(1000 * Math.pow(2, i))
    }
  }
  throw new Error('Max retries exceeded')
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const response = await fetchWithRetry('https://api.example.com/data')
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

    private static async Task<string> GetWithRetryAsync(string url, int retries = 3)
    {
        for (int i = 0; i < retries; i++)
        {
            try
            {
                var response = await _http.GetAsync(url);
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadAsStringAsync();
                if ((int)response.StatusCode < 500 || i == retries - 1)
                    throw new HttpRequestException($"HTTP {(int)response.StatusCode}");
            }
            catch when (i < retries - 1)
            {
                await Task.Delay(1000 * (int)Math.Pow(2, i));
            }
        }
        throw new Exception("Max retries exceeded");
    }

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var json = await GetWithRetryAsync("https://api.example.com/data");
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

### Response Caching

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const cacheKey = `api:data:${req.query.id}`

  let data = await kv.get(cacheKey)
  if (!data) {
    const response = await fetch(`https://api.example.com/data/${req.query.id}`)
    data = await response.json()
    await kv.set(cacheKey, data, 600000) // 10 min TTL
  }

  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const id = req.query.id as string
  const cacheKey = `api:data:${id}`

  let data = await kv.get(cacheKey)
  if (!data) {
    const response = await fetch(`https://api.example.com/data/${id}`)
    data = await response.json()
    await kv.set(cacheKey, data, 600000)
  }

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
        var kv = new KeyValueStore();
        var id = req.Query.TryGetValue("id", out var v) ? v : "default";
        var cacheKey = $"api:data:{id}";

        var cached = await kv.Get(cacheKey);
        if (cached is not null)
        {
            res.Type("application/json").Send(cached.ToString()!);
            return;
        }

        var json = await _http.GetStringAsync($"https://api.example.com/data/{id}");
        await kv.Set(cacheKey, JsonNode.Parse(json), 600000);
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

### 1. Use Environment Variables for Secrets

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ DON'T hardcode secrets
const response = await fetch('https://api.example.com', {
  headers: { Authorization: 'Bearer hardcoded-token' }
})

// ✅ DO use environment variables
const response = await fetch('https://api.example.com', {
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` }
})
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ✅ DO
const response = await fetch('https://api.example.com', {
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` }
})
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ DO
request.Headers.Authorization = new AuthenticationHeaderValue(
    "Bearer", Environment.GetEnvironmentVariable("API_TOKEN"));
```

  </TabItem>
</Tabs>

### 2. Always Handle Errors

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
try {
  const response = await fetch('https://api.example.com')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  res.json(data)
} catch (error) {
  res.status(500).json({ error: error.message })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
try {
  const response = await fetch('https://api.example.com')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  res.json(data)
} catch (error) {
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
try
{
    var response = await _http.GetAsync("https://api.example.com");
    response.EnsureSuccessStatusCode();
    var json = await response.Content.ReadAsStringAsync();
    res.Type("application/json").Send(json);
}
catch (HttpRequestException ex)
{
    res.Status(500).Json(new JsonObject { ["error"] = ex.Message });
}
```

  </TabItem>
</Tabs>

### 3. Set Timeouts

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const controller = new AbortController()
setTimeout(() => controller.abort(), 10000)
const response = await fetch(url, { signal: controller.signal })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 10000)
const response = await fetch(url, { signal: controller.signal })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// Set globally on HttpClient (preferred for static instance)
_http.Timeout = TimeSpan.FromSeconds(10);

// Or per-request with CancellationTokenSource
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
var response = await _http.GetAsync(url, cts.Token);
```

  </TabItem>
</Tabs>

## Next Steps

- [Response Object](/docs/api/bun/response) - Handling responses (Bun)
- [Examples](/docs/examples/webhook-handler) - HTTP examples

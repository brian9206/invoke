import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Timers & Async Operations Guide

Learn how to use timers and asynchronous operations in your Invoke functions.

## Overview

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  // Built-in sleep helper (Invoke-specific)
  await sleep(1000)

  res.json({ delayed: true, ts: Date.now() })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  await sleep(1000)

  res.json({ delayed: true, ts: Date.now() })
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
        await Task.Delay(1000);

        res.Status(200).Json(new JsonObject
        {
            ["delayed"] = true,
            ["ts"]      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }
}
```

  </TabItem>
</Tabs>

## setTimeout

Execute code after a delay:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  setTimeout(() => {
    console.log('Executed after 2 seconds')
  }, 2000)

  res.send('Timer set')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  setTimeout(() => {
    console.log('Executed after 2 seconds')
  }, 2000)

  res.send('Timer set')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        // Fire-and-forget background work
        _ = Task.Run(async () =>
        {
            await Task.Delay(2000);
            Console.WriteLine("Executed after 2 seconds");
        });

        res.Send("Timer set");
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### With Async/Await

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function handler(req, res) {
  console.log('Start')
  await delay(2000)
  console.log('After 2 seconds')
  res.send('Done')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  console.log('Start')
  await delay(2000)
  console.log('After 2 seconds')
  res.send('Done')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        Console.WriteLine("Start");
        await Task.Delay(2000);
        Console.WriteLine("After 2 seconds");
        res.Send("Done");
    }
}
```

  </TabItem>
</Tabs>

## setInterval

Execute code repeatedly at intervals:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  let count = 0

  const interval = setInterval(() => {
    count++
    console.log('Count:', count)

    if (count >= 5) {
      clearInterval(interval)
      res.send('Completed 5 iterations')
    }
  }, 1000)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  let count = 0

  const interval = setInterval(() => {
    count++
    console.log('Count:', count)

    if (count >= 5) {
      clearInterval(interval)
      res.send('Completed 5 iterations')
    }
  }, 1000)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        int count = 0;

        while (await timer.WaitForNextTickAsync())
        {
            count++;
            Console.WriteLine($"Count: {count}");
            if (count >= 5) break;
        }

        res.Send("Completed 5 iterations");
    }
}
```

  </TabItem>
</Tabs>

## setImmediate

Execute on next event loop tick:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  console.log('1')

  setImmediate(() => {
    console.log('3 - Immediate')
  })

  console.log('2')
  // Output: 1, 2, 3 - Immediate
  res.send('Done')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  console.log('1')

  setImmediate(() => {
    console.log('3 - Immediate')
  })

  console.log('2')
  // Output: 1, 2, 3 - Immediate
  res.send('Done')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        Console.WriteLine("1");
        Console.WriteLine("2");

        // Task.Yield() defers the continuation to the next scheduler turn
        await Task.Yield();
        Console.WriteLine("3 - Yielded");

        res.Send("Done");
    }
}
```

  </TabItem>
</Tabs>

## sleep() — Invoke Global (Bun) / Task.Delay (.NET)

Promise-based delay:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  console.log('Start:', new Date().toISOString())

  await sleep(1000)
  console.log('After 1 second')

  await sleep(2000)
  console.log('After 3 seconds total')

  res.json({ message: 'Completed', timestamp: new Date().toISOString() })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  console.log('Start:', new Date().toISOString())

  await sleep(1000)
  console.log('After 1 second')

  await sleep(2000)
  console.log('After 3 seconds total')

  res.json({ message: 'Completed', timestamp: new Date().toISOString() })
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
        Console.WriteLine($"Start: {DateTime.UtcNow:O}");

        await Task.Delay(1000);
        Console.WriteLine("After 1 second");

        await Task.Delay(2000);
        Console.WriteLine("After 3 seconds total");

        res.Status(200).Json(new JsonObject
        {
            ["message"]   = "Completed",
            ["timestamp"] = DateTime.UtcNow.ToString("O")
        });
    }
}
```

  </TabItem>
</Tabs>

## Timers/Promises API

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import { setTimeout as setTimeoutPromise } from 'timers/promises'

export default async function handler(req, res) {
  // Promise-based delay
  await setTimeoutPromise(1000)
  console.log('After 1 second')

  // Delay with a return value
  const result = await setTimeoutPromise(1000, 'delayed value')
  console.log(result) // 'delayed value'

  res.send('Done')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import { setTimeout as setTimeoutPromise } from 'timers/promises'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  await setTimeoutPromise(1000)
  console.log('After 1 second')

  const result = await setTimeoutPromise<string>(1000, 'delayed value')
  console.log(result)

  res.send('Done')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        await Task.Delay(1000);
        Console.WriteLine("After 1 second");

        // Delay then return a value
        var result = await DelayedValue(1000, "delayed value");
        Console.WriteLine(result);

        res.Send("Done");
    }

    private static async Task<T> DelayedValue<T>(int ms, T value)
    {
        await Task.Delay(ms);
        return value;
    }
}
```

  </TabItem>
</Tabs>

### Async Interval

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import { setInterval as setIntervalAsync } from 'timers/promises'

export default async function handler(req, res) {
  const messages = []
  let count = 0

  for await (const _ of setIntervalAsync(1000, Date.now())) {
    messages.push(`Tick ${++count} at ${new Date().toISOString()}`)
    if (count >= 5) break
  }

  res.json({ messages })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import { setInterval as setIntervalAsync } from 'timers/promises'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const messages: string[] = []
  let count = 0

  for await (const _ of setIntervalAsync(1000, Date.now())) {
    messages.push(`Tick ${++count} at ${new Date().toISOString()}`)
    if (count >= 5) break
  }

  res.json({ messages })
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
        var messages = new List<string>();
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));

        for (int count = 1; count <= 5; count++)
        {
            await timer.WaitForNextTickAsync();
            messages.Add($"Tick {count} at {DateTime.UtcNow:O}");
        }

        var arr = new JsonArray();
        foreach (var m in messages) arr.Add(m);
        res.Status(200).Json(new JsonObject { ["messages"] = arr });
    }
}
```

  </TabItem>
</Tabs>

## AbortController with Timers

Cancel timers using AbortController:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import { setTimeout as setTimeoutPromise } from 'timers/promises'

export default async function handler(req, res) {
  const controller = new AbortController()

  // Cancel after 3 seconds
  setTimeoutPromise(3000).then(() => controller.abort())

  try {
    await setTimeoutPromise(10000, 'completed', { signal: controller.signal })
    res.send('Completed 10 seconds')
  } catch (error) {
    if (error.name === 'AbortError') {
      res.send('Cancelled after 3 seconds')
    } else {
      throw error
    }
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import { setTimeout as setTimeoutPromise } from 'timers/promises'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const controller = new AbortController()

  setTimeoutPromise(3000).then(() => controller.abort())

  try {
    await setTimeoutPromise(10000, 'completed', { signal: controller.signal })
    res.send('Completed 10 seconds')
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      res.send('Cancelled after 3 seconds')
    } else {
      throw error
    }
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(10), cts.Token);
            res.Send("Completed 10 seconds");
        }
        catch (OperationCanceledException)
        {
            res.Send("Cancelled after 3 seconds");
        }
    }
}
```

  </TabItem>
</Tabs>

## Common Patterns

### Retry with Exponential Backoff

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()

      if (i < maxRetries - 1) await sleep(Math.pow(2, i) * 1000)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(Math.pow(2, i) * 1000)
    }
  }
}

export default async function handler(req, res) {
  const data = await fetchWithRetry('https://api.example.com/data')
  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
async function fetchWithRetry(url: string, maxRetries = 3): Promise<unknown> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
      if (i < maxRetries - 1) await sleep(Math.pow(2, i) * 1000)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(Math.pow(2, i) * 1000)
    }
  }
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = await fetchWithRetry('https://api.example.com/data')
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

    private static async Task<string> FetchWithRetry(string url, int maxRetries = 3)
    {
        for (int i = 0; i < maxRetries; i++)
        {
            try
            {
                var response = await _http.GetAsync(url);
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadAsStringAsync();
            }
            catch when (i < maxRetries - 1) { }

            await Task.Delay((int)Math.Pow(2, i) * 1000);
        }
        throw new Exception("Max retries exceeded");
    }

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var json = await FetchWithRetry("https://api.example.com/data");
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

### Timeout Wrapper

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
async function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  return Promise.race([promise, timeout])
}

export default async function handler(req, res) {
  try {
    const data = await withTimeout(
      fetch('https://api.example.com/slow').then(r => r.json()),
      5000
    )
    res.json(data)
  } catch (error) {
    res.status(408).json({ error: 'Request timeout' })
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  return Promise.race([promise, timeout])
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  try {
    const data = await withTimeout(
      fetch('https://api.example.com/slow').then(r => r.json()),
      5000
    )
    res.json(data)
  } catch {
    res.status(408).json({ error: 'Request timeout' })
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
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var json = await _http.GetStringAsync("https://api.example.com/slow", cts.Token);
            res.Type("application/json").Send(json);
        }
        catch (OperationCanceledException)
        {
            res.Status(408).Json(new JsonObject { ["error"] = "Request timeout" });
        }
    }
}
```

  </TabItem>
</Tabs>

### Debounce

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
function debounce(func, wait) {
  let timeout
  return function (...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }
}

export default async function handler(req, res) {
  const processRequest = debounce(async data => {
    console.log('Processing:', data)
    await kv.set('last:request', data)
  }, 1000)

  processRequest(req.body)
  res.send('Request queued')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout>
  return function (...args: Parameters<T>) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  } as T
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const processRequest = debounce(async (data: unknown) => {
    await kv.set('last:request', data)
  }, 1000)

  processRequest(req.body)
  res.send('Request queued')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

public static class Function
{
    // Per-key debounce using CancellationTokenSource
    private static readonly Dictionary<string, CancellationTokenSource> _pending = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv            = new KeyValueStore();
        const string key  = "global";
        const int waitMs  = 1000;

        if (_pending.TryGetValue(key, out var prev)) prev.Cancel();
        var cts = _pending[key] = new CancellationTokenSource();

        res.Send("Request queued");

        try
        {
            await Task.Delay(waitMs, cts.Token);
            await kv.Set("last:request", req.Body ?? new JsonObject());
        }
        catch (OperationCanceledException) { /* superseded by newer request */ }
    }
}
```

  </TabItem>
</Tabs>

### Throttle

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
function throttle(func, limit) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export default function handler(req, res) {
  const logRequest = throttle(() => {
    console.log('Request logged at', new Date().toISOString())
  }, 5000)

  logRequest()
  res.send('OK')
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle = false
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  } as T
}

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const logRequest = throttle(() => {
    console.log('Request logged at', new Date().toISOString())
  }, 5000)

  logRequest()
  res.send('OK')
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;

public static class Function
{
    private static DateTime _lastRun = DateTime.MinValue;
    private static readonly TimeSpan _limit = TimeSpan.FromSeconds(5);

    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var now = DateTime.UtcNow;
        if (now - _lastRun >= _limit)
        {
            _lastRun = now;
            Console.WriteLine($"Request logged at {now:O}");
        }

        res.Send("OK");
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Polling

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
async function poll(fn, validate, interval = 1000, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn()
    if (validate(result)) {
      return result
    }
    await sleep(interval)
  }
  throw new Error('Max polling attempts exceeded')
}

export default async function handler(req, res) {
  try {
    const result = await poll(
      () => fetch('https://api.example.com/job/123').then(r => r.json()),
      data => data.status === 'completed',
      2000, // Check every 2 seconds
      15 // Max 30 seconds
    )

    res.json(result)
  } catch (error) {
    res.status(408).json({ error: 'Job did not complete in time' })
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
async function poll<T>(
  fn: () => Promise<T>,
  validate: (result: T) => boolean,
  interval = 1000,
  maxAttempts = 30
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn()
    if (validate(result)) return result
    await sleep(interval)
  }
  throw new Error('Max polling attempts exceeded')
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  try {
    const result = await poll(
      () => fetch('https://api.example.com/job/123').then(r => r.json()),
      (data: any) => data.status === 'completed',
      2000,
      15
    )
    res.json(result)
  } catch {
    res.status(408).json({ error: 'Job did not complete in time' })
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

    private static async Task<JsonNode?> Poll(
        Func<Task<JsonNode?>> fn,
        Func<JsonNode?, bool> validate,
        int intervalMs = 1000,
        int maxAttempts = 30)
    {
        for (int i = 0; i < maxAttempts; i++)
        {
            var result = await fn();
            if (validate(result)) return result;
            await Task.Delay(intervalMs);
        }
        throw new TimeoutException("Max polling attempts exceeded");
    }

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        try
        {
            var result = await Poll(
                async () => JsonNode.Parse(await _http.GetStringAsync("https://api.example.com/job/123")),
                node => node?["status"]?.GetValue<string>() == "completed",
                2000, 15);

            res.Type("application/json").Send(result!.ToJsonString());
        }
        catch (TimeoutException)
        {
            res.Status(408).Json(new JsonObject { ["error"] = "Job did not complete in time" });
        }
    }
}
```

  </TabItem>
</Tabs>

### Rate Limiting with Timers

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
export default async function handler(req, res) {
  const clientId = req.headers['x-client-id'] || 'anonymous'
  const key = `ratelimit:${clientId}`

  const requests = (await kv.get(key)) || []
  const now = Date.now()
  const recentRequests = requests.filter(time => time > now - 60000)

  if (recentRequests.length >= 10) {
    const resetTime = new Date(recentRequests[0] + 60000).toISOString()
    return res.status(429).json({ error: 'Rate limit exceeded', resetAt: resetTime })
  }

  recentRequests.push(now)
  await kv.set(key, recentRequests, 60000)
  res.json({ success: true })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const clientId = (req.headers['x-client-id'] as string) ?? 'anonymous'
  const key = `ratelimit:${clientId}`
  const requests = ((await kv.get(key)) as number[]) ?? []
  const now = Date.now()
  const recentRequests = requests.filter(time => time > now - 60000)

  if (recentRequests.length >= 10) {
    const resetTime = new Date(recentRequests[0] + 60000).toISOString()
    return res.status(429).json({ error: 'Rate limit exceeded', resetAt: resetTime })
  }

  recentRequests.push(now)
  await kv.set(key, recentRequests, 60000)
  res.json({ success: true })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv       = new KeyValueStore();
        var clientId = req.GetHeader("x-client-id") ?? "anonymous";
        var key      = $"ratelimit:{clientId}";

        var raw      = (await kv.Get(key))?.ToString() ?? "[]";
        var requests = JsonSerializer.Deserialize<List<long>>(raw) ?? new();
        var now      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var recent   = requests.Where(t => t > now - 60000).ToList();

        if (recent.Count >= 10)
        {
            var resetAt = DateTimeOffset.FromUnixTimeMilliseconds(recent[0] + 60000).ToString("O");
            res.Status(429).Json(new JsonObject { ["error"] = "Rate limit exceeded", ["resetAt"] = resetAt });
            return;
        }

        recent.Add(now);
        await kv.Set(key, JsonSerializer.Serialize(recent), 60000);
        res.Status(200).Json(new JsonObject { ["success"] = true });
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

### 1. Clean Up Timers

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ✅ Always clear timers to prevent leaks
const timeout = setTimeout(() => {}, 5000)
clearTimeout(timeout)

const interval = setInterval(() => {}, 1000)
clearInterval(interval)
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {}, 5000)
clearTimeout(timeout)

const interval: ReturnType<typeof setInterval> = setInterval(() => {}, 1000)
clearInterval(interval)
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// Use `using` — disposed automatically at end of scope
using var cts   = new CancellationTokenSource();
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
```

  </TabItem>
</Tabs>

### 2. Use sleep() / Task.Delay for Simple Delays

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ Verbose
await new Promise(resolve => setTimeout(resolve, 1000))

// ✅ Simple
await sleep(1000)
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ❌ Verbose
await new Promise<void>(resolve => setTimeout(resolve, 1000))

// ✅ Simple
await sleep(1000)
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ Simple
await Task.Delay(1000);
```

  </TabItem>
</Tabs>

### 3. Handle Long-Running Operations

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// Set a timeout on outgoing requests
const controller = new AbortController()
setTimeout(() => controller.abort(), 30000)
await fetch(url, { signal: controller.signal })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 30000)
await fetch(url, { signal: controller.signal })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
await _http.GetAsync(url, cts.Token);
```

  </TabItem>
</Tabs>

### 4. Avoid Blocking

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ Blocks the event loop
for (let i = 0; i < 1_000_000; i++) {
  /* heavy work */
}

// ✅ Yield to the event loop periodically
for (let i = 0; i < 1_000_000; i++) {
  if (i % 1000 === 0) await sleep(0)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ✅ Yield to the event loop periodically
for (let i = 0; i < 1_000_000; i++) {
  if (i % 1000 === 0) await sleep(0)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ Yield to the task scheduler periodically
for (int i = 0; i < 1_000_000; i++)
{
    if (i % 1000 == 0) await Task.Yield();
    // heavy work
}
```

  </TabItem>
</Tabs>

## Next Steps

- [HTTP Requests](/docs/guides/http-requests) - Async request patterns
- [Examples](/docs/examples/hello-world) - Async function examples

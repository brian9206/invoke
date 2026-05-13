# KeyValueStore

`KeyValueStore` is the C# SDK class for accessing Invoke's persistent distributed key-value store. Each instance connects to the same project-scoped store.

## Instantiation

Create a new instance anywhere in your handler:

```csharp
var kv = new KeyValueStore();
```

## Methods

### `Get(key)`

Retrieve a value by key. Returns `null` if the key does not exist or has expired.

```csharp
public Task<object?> Get(string key)
```

```csharp
var kv = new KeyValueStore();
var value = await kv.Get("user:42");

if (value is null)
{
    res.Status(404).Json(new JsonObject { ["error"] = "Not found" });
    return;
}

res.Status(200).Json(new JsonObject { ["value"] = value?.ToString() });
```

**Returns:** `Task<object?>` — The stored value deserialized from JSON, or `null`.

**Supported stored types:** strings, numbers, booleans, JSON objects/arrays.

---

### `Set(key, value, ttlMs?)`

Store a value with an optional TTL (time-to-live) in milliseconds.

```csharp
public Task Set(string key, object value, long? ttlMs = null)
```

```csharp
var kv = new KeyValueStore();

// Permanent storage
await kv.Set("user:42", new JsonObject { ["name"] = "Alice" });

// Expires in 1 hour
await kv.Set("session:abc", new JsonObject { ["userId"] = 42 }, 3_600_000);

// Expires in 5 minutes
await kv.Set("rate:ip:1.2.3.4", 1, 300_000);
```

**Parameters:**

- `key` — Storage key
- `value` — Any JSON-serializable value
- `ttlMs` _(optional)_ — Expiry in milliseconds from now

---

### `Delete(key)`

Delete a key from the store.

```csharp
public Task Delete(string key)
```

```csharp
var kv = new KeyValueStore();
await kv.Delete("session:abc");

res.Status(204).End();
```

---

### `List(prefix?)`

List all keys, optionally filtered by prefix. Returns an array of key strings.

```csharp
public Task<string[]> List(string? prefix = null)
```

```csharp
var kv = new KeyValueStore();

// All keys
var allKeys = await kv.List();

// Keys starting with "user:"
var userKeys = await kv.List("user:");

res.Status(200).Json(new JsonObject { ["keys"] = string.Join(", ", userKeys) });
```

## Common Patterns

### Counter with TTL

```csharp
[EntryPoint]
public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    var kv = new KeyValueStore();
    var key = $"counter:{req.Ip}";

    var current = await kv.Get(key);
    var count = current is null ? 0 : Convert.ToInt32(current);

    count++;
    await kv.Set(key, count, 60_000); // reset after 1 minute

    res.Status(200).Json(new JsonObject { ["count"] = count });
}
```

### Session cache

```csharp
[HttpGet("/profile")]
public async Task GetProfile(InvokeRequest req, InvokeResponse res)
{
    var sessionId = req.Cookies.TryGetValue("session", out var s) ? s : null;
    if (sessionId is null)
    {
        res.Status(401).Json(new JsonObject { ["error"] = "Unauthorized" });
        return;
    }

    var kv = new KeyValueStore();
    var session = await kv.Get($"session:{sessionId}");

    if (session is null)
    {
        res.Status(401).Json(new JsonObject { ["error"] = "Session expired" });
        return;
    }

    res.Status(200).Json(new JsonObject { ["profile"] = session?.ToString() });
}
```

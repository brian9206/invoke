# InvokeRequest

`InvokeRequest` represents the incoming HTTP request. It is passed as the first parameter to every entry point handler.

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    // req is available here
    return Task.CompletedTask;
}
```

## Properties

### `Method`

The HTTP method of the request as an uppercase string.

```csharp
public string Method { get; }
```

```csharp
switch (req.Method)
{
    case "GET":    /* ... */ break;
    case "POST":   /* ... */ break;
    case "PUT":    /* ... */ break;
    case "DELETE": /* ... */ break;
}
```

**Values:** `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, `"OPTIONS"`, `"HEAD"`

---

### `Path`

The path portion of the URL, without query string.

```csharp
public string Path { get; }
```

```csharp
// Request: /api/users/123
Console.WriteLine(req.Path); // "/api/users/123"
```

---

### `Url`

The full URL including query string.

```csharp
public string Url { get; }
```

```csharp
// Request: /api/users?sort=name
Console.WriteLine(req.Url); // "/api/users?sort=name"
```

---

### `OriginalUrl`

The original unmodified URL.

```csharp
public string OriginalUrl { get; }
```

---

### `Query`

Parsed query string parameters as a case-insensitive dictionary.

```csharp
public IReadOnlyDictionary<string, string> Query { get; }
```

```csharp
// Request: /api/users?name=Alice&page=2
var name = req.Query.TryGetValue("name", out var n) ? n : "World";
var page = req.Query.TryGetValue("page", out var p) ? int.Parse(p) : 1;

res.Status(200).Json(new JsonObject { ["name"] = name, ["page"] = page });
```

---

### `Params`

Route parameters extracted from path patterns (set by the `Router`).

```csharp
public IReadOnlyDictionary<string, string> Params { get; }
```

```csharp
// Route:   [HttpGet("/users/:id")]
// Request: /users/42
var id = req.Params["id"]; // "42"
```

---

### `Body`

The parsed request body as a `JsonNode`. For requests with `Content-Type: application/json`, the body is automatically deserialized. Returns `null` for requests with no body.

```csharp
public JsonNode? Body { get; }
```

```csharp
// POST with JSON body: { "name": "Alice", "age": 30 }
var name = req.Body?["name"]?.GetValue<string>() ?? "";
var age  = req.Body?["age"]?.GetValue<int>() ?? 0;

res.Status(201).Json(new JsonObject { ["created"] = true, ["name"] = name });
```

---

### `Headers`

Request headers as a case-insensitive dictionary.

```csharp
public IReadOnlyDictionary<string, string> Headers { get; }
```

```csharp
if (req.Headers.TryGetValue("authorization", out var auth))
{
    // validate auth...
}
```

---

### `Cookies`

Parsed cookies from the `Cookie` request header.

```csharp
public IReadOnlyDictionary<string, string> Cookies { get; }
```

```csharp
if (req.Cookies.TryGetValue("session", out var sessionId))
{
    // use sessionId...
}
```

---

### `Ip`

The client IP address.

```csharp
public string Ip { get; }
```

---

### `Ips`

Array of IP addresses from the `X-Forwarded-For` header (proxied requests).

```csharp
public string[] Ips { get; }
```

---

### `Protocol`

The protocol string: `"http"` or `"https"`.

```csharp
public string Protocol { get; }
```

---

### `Hostname`

The hostname from the `Host` header.

```csharp
public string Hostname { get; }
```

---

### `Secure`

`true` if the connection uses HTTPS.

```csharp
public bool Secure { get; }
```

## Methods

### `GetHeader(name)`

Get a single header value by name (case-insensitive). Returns `null` if not present.

```csharp
public string? GetHeader(string name)
```

```csharp
var contentType = req.GetHeader("content-type");
var apiKey = req.GetHeader("x-api-key");
```

## Common Patterns

### Parsing a JSON POST body

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    if (req.Method != "POST")
    {
        res.Status(405).Json(new JsonObject { ["error"] = "Method Not Allowed" });
        return Task.CompletedTask;
    }

    var name = req.Body?["name"]?.GetValue<string>();
    if (string.IsNullOrEmpty(name))
    {
        res.Status(400).Json(new JsonObject { ["error"] = "name is required" });
        return Task.CompletedTask;
    }

    res.Status(201).Json(new JsonObject { ["created"] = true, ["name"] = name });
    return Task.CompletedTask;
}
```

### Bearer token authentication

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    var auth = req.GetHeader("authorization");
    if (auth == null || !auth.StartsWith("Bearer "))
    {
        res.Status(401).Json(new JsonObject { ["error"] = "Unauthorized" });
        return Task.CompletedTask;
    }

    var token = auth["Bearer ".Length..];
    // validate token...

    res.Status(200).Json(new JsonObject { ["ok"] = true });
    return Task.CompletedTask;
}
```

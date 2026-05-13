# InvokeResponse

`InvokeResponse` is the fluent response builder passed as the second parameter to every entry point handler. Methods can be chained.

```csharp
[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    res.Status(200).Json(new JsonObject { ["message"] = "Hello" });
    return Task.CompletedTask;
}
```

## Status Methods

### `Status(code)`

Set the HTTP status code. Returns `this` for chaining.

```csharp
public InvokeResponse Status(int statusCode)
```

```csharp
res.Status(201).Json(new JsonObject { ["created"] = true });
res.Status(404).Json(new JsonObject { ["error"] = "Not Found" });
```

---

### `SendStatus(code)`

Set the status code and end the response immediately with the status text as the body.

```csharp
public void SendStatus(int statusCode)
```

```csharp
res.SendStatus(204); // 204 No Content
res.SendStatus(404); // 404 Not Found
```

## Response Body Methods

### `Json(object)`

Serialize an object to JSON and send it with `Content-Type: application/json`.

```csharp
public void Json(object value)
```

```csharp
res.Status(200).Json(new JsonObject
{
    ["name"] = "Alice",
    ["age"]  = 30
});
```

---

### `Json<T>(T value, JsonTypeInfo<T> typeInfo)`

AOT-safe JSON serialization using a `JsonTypeInfo<T>` from a source-generated `JsonSerializerContext`.

```csharp
public void Json<T>(T value, JsonTypeInfo<T> typeInfo)
```

```csharp
[JsonSerializable(typeof(MyResponse))]
internal partial class MyContext : JsonSerializerContext { }

record MyResponse(string Name, int Age);

res.Status(200).Json(new MyResponse("Alice", 30), MyContext.Default.MyResponse);
```

---

### `Json(JsonNode value)`

Send a `JsonNode` (e.g., `JsonObject` or `JsonArray`) as JSON.

```csharp
public void Json(JsonNode value)
```

```csharp
var items = new JsonArray();
items.Add(new JsonObject { ["id"] = 1, ["name"] = "Item 1" });
items.Add(new JsonObject { ["id"] = 2, ["name"] = "Item 2" });

res.Status(200).Json(items);
```

---

### `Send(string text)`

Send a plain text response with `Content-Type: text/plain`.

```csharp
public void Send(string text)
```

```csharp
res.Status(200).Send("Hello, World!");
```

---

### `Send(byte[] data)`

Send raw bytes. Use `Type()` first to set the correct content type.

```csharp
public void Send(byte[] data)
```

```csharp
var pdfBytes = File.ReadAllBytes("report.pdf");
res.Status(200).Type("application/pdf").Send(pdfBytes);
```

---

### `Redirect(string url, int statusCode = 302)`

Redirect the client to another URL.

```csharp
public void Redirect(string url, int statusCode = 302)
```

```csharp
res.Redirect("/new-path");           // 302 Found
res.Redirect("/new-path", 301);      // 301 Moved Permanently
```

---

### `End()`

End the response with no body.

```csharp
public void End()
```

```csharp
res.Status(204).End();
```

## Header Methods

### `SetHeader(name, value)`

Set a response header. Returns `this` for chaining.

```csharp
public InvokeResponse SetHeader(string name, string value)
```

```csharp
res.SetHeader("x-request-id", Guid.NewGuid().ToString())
   .Status(200)
   .Json(new JsonObject { ["ok"] = true });
```

---

### `AppendHeader(name, value)`

Append a value to a response header (useful for multi-value headers). Returns `this` for chaining.

```csharp
public InvokeResponse AppendHeader(string name, string value)
```

```csharp
res.AppendHeader("cache-control", "no-cache")
   .AppendHeader("cache-control", "no-store");
```

---

### `Type(contentType)`

Set the `Content-Type` header. Returns `this` for chaining.

```csharp
public InvokeResponse Type(string contentType)
```

```csharp
res.Type("text/html").Send("<h1>Hello</h1>");
res.Type("application/xml").Send("<result>ok</result>");
```

## Common Patterns

### Success with data

```csharp
res.Status(200).Json(new JsonObject
{
    ["success"] = true,
    ["data"]    = new JsonObject { ["id"] = 42, ["name"] = "Alice" }
});
```

### Created resource

```csharp
res.Status(201)
   .SetHeader("location", $"/users/{newId}")
   .Json(new JsonObject { ["id"] = newId });
```

### Error response

```csharp
res.Status(400).Json(new JsonObject
{
    ["error"]   = "Validation failed",
    ["details"] = "name is required"
});
```

### No content

```csharp
res.Status(204).End();
```

# Router

The `Router` abstract class enables attribute-based HTTP routing for multi-route C# functions. Subclass it, mark the class with `[EntryPoint]` and `partial`, then decorate methods with HTTP method attributes.

## Setup

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    [HttpGet("/")]
    public Task Index(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["message"] = "Hello" });
        return Task.CompletedTask;
    }
}
```

:::note
The class **must** be `partial`. The SDK source generator adds the route dispatcher implementation at compile time.
:::

## HTTP Method Attributes

All six HTTP methods are supported:

| Attribute             | HTTP Method |
| --------------------- | ----------- |
| `[HttpGet(path)]`     | GET         |
| `[HttpPost(path)]`    | POST        |
| `[HttpPut(path)]`     | PUT         |
| `[HttpPatch(path)]`   | PATCH       |
| `[HttpDelete(path)]`  | DELETE      |
| `[HttpOptions(path)]` | OPTIONS     |

```csharp
[EntryPoint]
public partial class App : Router
{
    [HttpGet("/users")]
    public Task ListUsers(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonArray()); // empty list
        return Task.CompletedTask;
    }

    [HttpPost("/users")]
    public Task CreateUser(InvokeRequest req, InvokeResponse res)
    {
        res.Status(201).Json(req.Body!);
        return Task.CompletedTask;
    }

    [HttpPut("/users/:id")]
    public Task UpdateUser(InvokeRequest req, InvokeResponse res)
    {
        res.Status(200).Json(new JsonObject { ["id"] = req.Params["id"] });
        return Task.CompletedTask;
    }

    [HttpDelete("/users/:id")]
    public Task DeleteUser(InvokeRequest req, InvokeResponse res)
    {
        res.Status(204).End();
        return Task.CompletedTask;
    }
}
```

## Path Parameters

Use `:paramName` syntax in the path. Extracted values are available via `req.Params`.

```csharp
[HttpGet("/users/:userId/posts/:postId")]
public Task GetPost(InvokeRequest req, InvokeResponse res)
{
    var userId = req.Params["userId"];
    var postId = req.Params["postId"];

    res.Status(200).Json(new JsonObject
    {
        ["userId"] = userId,
        ["postId"] = postId
    });
    return Task.CompletedTask;
}
```

## Handler Signature

Every route handler must accept `(InvokeRequest req, InvokeResponse res)` and return `Task`:

```csharp
public Task MethodName(InvokeRequest req, InvokeResponse res)
public async Task MethodName(InvokeRequest req, InvokeResponse res)
```

## Full CRUD Example

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    // In-memory store — use KeyValueStore for persistent data
    private static readonly List<JsonObject> _items = new()
    {
        new JsonObject { ["id"] = 1, ["name"] = "Item 1" },
        new JsonObject { ["id"] = 2, ["name"] = "Item 2" }
    };
    private static int _nextId = 3;

    [HttpGet("/")]
    public Task List(InvokeRequest req, InvokeResponse res)
    {
        var arr = new JsonArray();
        foreach (var item in _items)
            arr.Add(item.DeepClone());

        res.Status(200).Json(new JsonObject { ["items"] = arr, ["count"] = _items.Count });
        return Task.CompletedTask;
    }

    [HttpGet("/:id")]
    public Task Get(InvokeRequest req, InvokeResponse res)
    {
        var id = int.Parse(req.Params["id"]);
        var item = _items.FirstOrDefault(i => i["id"]?.GetValue<int>() == id);

        if (item is null)
        {
            res.Status(404).Json(new JsonObject { ["error"] = "Not found" });
            return Task.CompletedTask;
        }

        res.Status(200).Json(item.DeepClone());
        return Task.CompletedTask;
    }

    [HttpPost("/")]
    public Task Create(InvokeRequest req, InvokeResponse res)
    {
        var name = req.Body?["name"]?.GetValue<string>();
        if (string.IsNullOrEmpty(name))
        {
            res.Status(400).Json(new JsonObject { ["error"] = "name is required" });
            return Task.CompletedTask;
        }

        var newItem = new JsonObject { ["id"] = _nextId++, ["name"] = name };
        _items.Add(newItem);

        res.Status(201).Json(newItem.DeepClone());
        return Task.CompletedTask;
    }

    [HttpDelete("/:id")]
    public Task Delete(InvokeRequest req, InvokeResponse res)
    {
        var id = int.Parse(req.Params["id"]);
        var removed = _items.RemoveAll(i => i["id"]?.GetValue<int>() == id) > 0;

        if (!removed)
        {
            res.Status(404).Json(new JsonObject { ["error"] = "Not found" });
            return Task.CompletedTask;
        }

        res.Status(204).End();
        return Task.CompletedTask;
    }
}
```

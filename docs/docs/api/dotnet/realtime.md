# RealtimeNamespace

`RealtimeNamespace` is the base class for Socket.IO-style event-driven functions in C#. Subclass it, set `Namespace` in the constructor, and handle events with `[RealtimeEvent]`-decorated methods.

## Setup

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
    public App()
    {
        Namespace = "/chat";
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        await To("room").Emit("message", arg);
    }
}
```

:::note
The class **must** be `partial`. The SDK source generator produces the event dispatcher at compile time.
:::

## Properties

### `Namespace`

The Socket.IO namespace path. Set in the constructor.

```csharp
protected string Namespace { get; set; }
```

```csharp
public App() { Namespace = "/chat"; }
```

---

### `SocketId`

The ID of the currently connected socket (available during event handling).

```csharp
protected string SocketId { get; }
```

```csharp
[RealtimeEvent("$connect")]
public async Task OnConnect(JsonNode arg)
{
    Console.WriteLine($"Client connected: {SocketId}");
    await Emit("welcome", new JsonObject { ["id"] = SocketId });
}
```

## Methods

### `Emit(eventName, payload)`

Emit an event to the current socket.

```csharp
protected Task Emit(string eventName, object payload)
```

```csharp
await Emit("pong", new JsonObject { ["ts"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
```

---

### `To(room)`

Return a `BroadcastOperator` targeting a specific room.

```csharp
protected BroadcastOperator To(string room)
```

```csharp
await To("lobby").Emit("announcement", new JsonObject { ["text"] = "Hello, lobby!" });
```

---

### `In(room)`

Alias for `To(room)`.

```csharp
protected BroadcastOperator In(string room)
```

---

### `Except(room)`

Return a `BroadcastOperator` that broadcasts to all rooms **except** the specified one.

```csharp
protected BroadcastOperator Except(string room)
```

```csharp
await Except("muted").Emit("chat", arg);
```

## BroadcastOperator

`BroadcastOperator` is a chainable targeting object returned by `To()`, `In()`, and `Except()`.

### `Emit(eventName, payload)`

Send an event to the targeted room(s).

```csharp
public Task Emit(string eventName, object payload)
```

### `To(room)` / `Except(room)`

Chain additional room filters.

```csharp
await To("room1").Except("muted").Emit("message", arg);
```

## The `[RealtimeEvent]` Attribute

Decorate any public method with `[RealtimeEvent("eventName")]` to register it as an event handler. The method receives the event payload as `JsonNode`.

```csharp
[RealtimeEvent("eventName")]
public async Task HandlerMethod(JsonNode arg)
{
    // arg is the event payload
}
```

### Reserved events

| Event name    | Fired when            |
| ------------- | --------------------- |
| `$connect`    | A new client connects |
| `$disconnect` | A client disconnects  |

```csharp
[RealtimeEvent("$connect")]
public async Task OnConnect(JsonNode arg)
{
    await To("lobby").Emit("joined", new JsonObject { ["id"] = SocketId });
}

[RealtimeEvent("$disconnect")]
public Task OnDisconnect(JsonNode arg)
{
    Console.WriteLine($"Client left: {SocketId}");
    return Task.CompletedTask;
}
```

## Complete Chat Example

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
    public App()
    {
        Namespace = "/chat";
    }

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode arg)
    {
        await To("lobby").Emit("user_joined", new JsonObject { ["id"] = SocketId });
        await Emit("welcome", new JsonObject { ["message"] = "Welcome to the chat!" });
    }

    [RealtimeEvent("join_room")]
    public async Task OnJoinRoom(JsonNode arg)
    {
        var room = arg.GetValue<string>();
        await To(room).Emit("user_joined", new JsonObject { ["id"] = SocketId, ["room"] = room });
        await Emit("joined", new JsonObject { ["room"] = room });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        var room = arg["room"]?.GetValue<string>() ?? "lobby";
        var text = arg["text"]?.GetValue<string>() ?? "";

        await To(room).Emit("message", new JsonObject
        {
            ["from"] = SocketId,
            ["text"] = text,
            ["ts"]   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }

    [RealtimeEvent("$disconnect")]
    public async Task OnDisconnect(JsonNode arg)
    {
        await To("lobby").Emit("user_left", new JsonObject { ["id"] = SocketId });
    }
}
```

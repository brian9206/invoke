import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Realtime Functions

Build event-driven, bidirectional realtime features — chat, live dashboards, notifications, and more — using Socket.IO and Invoke functions.

## How It Works

Invoke's realtime system connects Socket.IO clients to your functions through the gateway:

1. **Client connects** — A browser or device opens a Socket.IO connection to the gateway.
2. **Gateway authenticates** — The gateway checks the namespace's configured auth methods.
3. **Function invoked** — For each socket event (`$connect`, `$disconnect`, or custom), the gateway invokes the function mapped to that event.
4. **Function responds** — Your function can emit messages, join rooms, and broadcast — all routed back through the gateway to connected clients.

Each event invocation is stateless. The socket's `id`, `rooms`, and `handshake` metadata are passed to your function on every call, so you always have the context you need.

## Setting Up a Namespace

Before writing code, configure a realtime namespace in the admin UI:

1. Go to **API Gateway** for your project.
2. Switch to the **Realtime** tab.
3. Click **Add Namespace** and set the **Namespace Path** (e.g. `/chat`).
4. Add **Event Handlers** — map event names to functions:
   - `$connect` — runs when a client connects
   - `$disconnect` — runs when a client disconnects
   - Any custom name (e.g. `message`, `typing`) — runs when the client emits that event
5. Optionally attach **Authentication Methods** (API key, JWT, etc.).
6. Save the namespace.

Clients will connect to `/<project-slug><namespace-path>` on your gateway domain. For example, if your project slug is `myapp` and namespace path is `/chat`, clients connect to `/myapp/chat`.

## Basic Handler

A minimal function that handles connections, messages, and disconnections:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace()

ns.socket.on('$connect', function () {
  console.log('Connected:', ns.socket.id)
  ns.socket.emit('welcome', { message: 'Hello!' })
})

ns.socket.on('message', function (data) {
  ns.socket.broadcast.emit('message', {
    from: ns.socket.id,
    text: data.text
  })
})

ns.socket.on('$disconnect', function (reason) {
  console.log('Disconnected:', ns.socket.id, reason)
})

export default ns
```

**Note:** `RealtimeNamespace` is a global — no `require()` needed.

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace()

ns.socket.on('$connect', function () {
  console.log('Connected:', ns.socket.id)
  ns.socket.emit('welcome', { message: 'Hello!' })
})

ns.socket.on('message', function (data: { text: string }) {
  ns.socket.broadcast.emit('message', { from: ns.socket.id, text: data.text })
})

ns.socket.on('$disconnect', function (reason: string) {
  console.log('Disconnected:', ns.socket.id, reason)
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : RealtimeNamespace
{
    public App() { Namespace = "/chat"; }

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode arg)
    {
        Console.WriteLine($"Connected: {SocketId}");
        await Emit("welcome", new JsonObject { ["message"] = "Hello!" });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode arg)
    {
        var text = arg["text"]?.GetValue<string>() ?? "";
        await To("lobby").Emit("message", new JsonObject { ["from"] = SocketId, ["text"] = text });
    }

    [RealtimeEvent("$disconnect")]
    public Task OnDisconnect(JsonNode arg)
    {
        Console.WriteLine($"Disconnected: {SocketId}");
        return Task.CompletedTask;
    }
}
```

See the [.NET Realtime API](/docs/api/dotnet/realtime) for full documentation.

  </TabItem>
</Tabs>

## Rooms

Rooms let you group sockets for targeted broadcasting. A socket can be in multiple rooms at once.

### Joining and Leaving

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.on('joinRoom', function (data) {
  ns.socket.join(data.room)
  ns.socket.emit('joined', { room: data.room })
  ns.socket.to(data.room).emit('userJoined', { socketId: ns.socket.id })
})

ns.socket.on('leaveRoom', function (data) {
  ns.socket.to(data.room).emit('userLeft', { socketId: ns.socket.id })
  ns.socket.leave(data.room)
})
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.on('joinRoom', function (data: { room: string }) {
  ns.socket.join(data.room)
  ns.socket.emit('joined', { room: data.room })
  ns.socket.to(data.room).emit('userJoined', { socketId: ns.socket.id })
})

ns.socket.on('leaveRoom', function (data: { room: string }) {
  ns.socket.to(data.room).emit('userLeft', { socketId: ns.socket.id })
  ns.socket.leave(data.room)
})
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[RealtimeEvent("joinRoom")]
public async Task OnJoinRoom(JsonNode data)
{
    var room = data["room"]?.GetValue<string>();
    if (room is null) return;
    await To(room).Emit("userJoined", new JsonObject { ["socketId"] = SocketId });
    await Emit("joined", new JsonObject { ["room"] = room });
}

[RealtimeEvent("leaveRoom")]
public async Task OnLeaveRoom(JsonNode data)
{
    var room = data["room"]?.GetValue<string>();
    if (room is null) return;
    await To(room).Emit("userLeft", new JsonObject { ["socketId"] = SocketId });
}
```

  </TabItem>
</Tabs>

### Broadcasting to a Room

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.on('message', function (data) {
  // Send to everyone in the room except the sender
  ns.socket.to(data.room).emit('message', {
    from: ns.socket.id,
    text: data.text
  })
})
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.on('message', function (data: { room: string; text: string }) {
  ns.socket.to(data.room).emit('message', {
    from: ns.socket.id,
    text: data.text
  })
})
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[RealtimeEvent("message")]
public async Task OnMessage(JsonNode data)
{
    var room = data["room"]?.GetValue<string>();
    var text = data["text"]?.GetValue<string>();
    if (room is null || text is null) return;
    await To(room).Emit("message", new JsonObject { ["from"] = SocketId, ["text"] = text });
}
```

  </TabItem>
</Tabs>

### Multi-Room Targeting

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// Send to sockets in room1 OR room2
ns.socket.to('room1').to('room2').emit('announcement', { text: 'Hello both rooms!' })

// Send to room1 but exclude room2
ns.socket.to('room1').except('room2').emit('exclusive', { text: 'Only room1' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.to('room1').to('room2').emit('announcement', { text: 'Hello both rooms!' })
ns.socket.to('room1').except('room2').emit('exclusive', { text: 'Only room1' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// Send to room1 OR room2
await To("room1").To("room2").Emit("announcement", new JsonObject { ["text"] = "Hello both rooms!" });

// Send to room1, excluding room2
await To("room1").Except("room2").Emit("exclusive", new JsonObject { ["text"] = "Only room1" });
```

  </TabItem>
</Tabs>

## Authentication

Namespaces can require authentication. Configure auth methods in the admin UI when creating or editing a namespace — the same methods available for HTTP routes (API key, JWT, OAuth, etc.) work for realtime namespaces.

When multiple auth methods are configured, choose the logic:

- **Any match (OR)** — the client passes if any one method succeeds
- **All match (AND)** — every method must succeed

Clients provide credentials via the Socket.IO `auth` option:

```javascript
// Client-side (browser)
const socket = io('https://gateway.example.com/myapp/chat', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
})
```

In your function, access the auth payload through the handshake:

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.on('$connect', function () {
  const token = ns.socket.handshake.auth.token
  const userId = ns.socket.handshake.query.userId
  console.log('Authenticated with token:', token)
})
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.on('$connect', function () {
  const token = (ns.socket.handshake.auth as { token: string }).token
  const userId = ns.socket.handshake.query.userId as string
  console.log('Authenticated with token:', token)
})
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[RealtimeEvent("$connect")]
public Task OnConnect(JsonNode data)
{
    var token  = data["auth"]?["token"]?.GetValue<string>();
    var userId = data["query"]?["userId"]?.GetValue<string>();
    Console.WriteLine($"Authenticated with token: {token}");
    return Task.CompletedTask;
}
```

  </TabItem>
</Tabs>

If authentication fails, the gateway disconnects the client before the `$connect` handler runs.

## Broadcasting Patterns

### To a specific socket

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.emit('directMessage', { text: 'Just for you' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.emit('directMessage', { text: 'Just for you' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await Emit("directMessage", new JsonObject { ["text"] = "Just for you" });
```

  </TabItem>
</Tabs>

### To a room (excluding sender)

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.to('general').emit('chat', { text: 'Hello room' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.to('general').emit('chat', { text: 'Hello room' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await To("general").Emit("chat", new JsonObject { ["text"] = "Hello room" });
```

  </TabItem>
</Tabs>

### To all (excluding sender)

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.broadcast.emit('announcement', { text: 'News flash' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.broadcast.emit('announcement', { text: 'News flash' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await Broadcast().Emit("announcement", new JsonObject { ["text"] = "News flash" });
```

  </TabItem>
</Tabs>

### To entire namespace (including sender)

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.emit('serverNotice', { text: 'Server restart in 5 minutes' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.emit('serverNotice', { text: 'Server restart in 5 minutes' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await EmitAll("serverNotice", new JsonObject { ["text"] = "Server restart in 5 minutes" });
```

  </TabItem>
</Tabs>

### To multiple rooms

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.to('admins').to('moderators').emit('alert', { level: 'high' })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.to('admins').to('moderators').emit('alert', { level: 'high' })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await To("admins").To("moderators").Emit("alert", new JsonObject { ["level"] = "high" });
```

  </TabItem>
</Tabs>

### To a room, excluding another room

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.to('premium').except('banned').emit('offer', { discount: 20 })
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.to('premium').except('banned').emit('offer', { discount: 20 })
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
await To("premium").Except("banned").Emit("offer", new JsonObject { ["discount"] = 20 });
```

  </TabItem>
</Tabs>

## Client Connection

Connect from a browser using the [socket.io-client](https://www.npmjs.com/package/socket.io-client) library:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
  const socket = io('https://gateway.example.com/myapp/chat', {
    auth: { token: 'your-auth-token' }
  })

  socket.on('connect', () => {
    console.log('Connected:', socket.id)
  })

  socket.on('welcome', data => {
    console.log(data.message)
  })

  socket.on('message', data => {
    console.log(`${data.from}: ${data.text}`)
  })

  // Send a message
  socket.emit('message', { text: 'Hello everyone!' })

  // Join a room
  socket.emit('joinRoom', { room: 'general' })

  socket.on('disconnect', reason => {
    console.log('Disconnected:', reason)
  })
</script>
```

Or with a bundler (npm):

```javascript
import { io } from 'socket.io-client'

const socket = io('https://gateway.example.com/myapp/chat', {
  auth: { token: localStorage.getItem('authToken') }
})

socket.on('connect', () => console.log('Connected'))
socket.on('message', data => console.log(data))
socket.emit('message', { text: 'Hello!' })
```

**Connection URL format:** `https://<gateway-domain>/<project-slug><namespace-path>`

For custom domains, omit the project slug: `https://api.mysite.com/chat`

## Common Patterns

### Chat Room

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace()

ns.socket.on('$connect', function () {
  ns.socket.data.username = ns.socket.handshake.auth.username || 'Anonymous'
  ns.socket.join('lobby')
  ns.socket.to('lobby').emit('userJoined', { username: ns.socket.data.username })
})

ns.socket.on('message', function (data) {
  ns.socket.to(data.room || 'lobby').emit('message', {
    from: ns.socket.data.username,
    text: data.text,
    timestamp: Date.now()
  })
})

ns.socket.on('$disconnect', function () {
  ns.emit('userLeft', { username: ns.socket.data.username })
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace()

ns.socket.on('$connect', function () {
  ns.socket.data.username = (ns.socket.handshake.auth as { username?: string }).username ?? 'Anonymous'
  ns.socket.join('lobby')
  ns.socket.to('lobby').emit('userJoined', { username: ns.socket.data.username })
})

ns.socket.on('message', function (data: { room?: string; text: string }) {
  ns.socket.to(data.room ?? 'lobby').emit('message', {
    from: ns.socket.data.username as string,
    text: data.text,
    timestamp: Date.now()
  })
})

ns.socket.on('$disconnect', function () {
  ns.emit('userLeft', { username: ns.socket.data.username })
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class Chat : RealtimeNamespace
{
    public override string Namespace => "/chat";

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode data)
    {
        var kv       = new KeyValueStore();
        var username = data["auth"]?["username"]?.GetValue<string>() ?? "Anonymous";
        await kv.Set($"{SocketId}:username", username);
        await To("lobby").Emit("userJoined", new JsonObject { ["username"] = username });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(JsonNode data)
    {
        var kv       = new KeyValueStore();
        var room     = data["room"]?.GetValue<string>() ?? "lobby";
        var text     = data["text"]?.GetValue<string>();
        var username = (await kv.Get($"{SocketId}:username"))?.ToString() ?? "Anonymous";
        if (text is null) return;
        await To(room).Emit("message", new JsonObject
        {
            ["from"] = username, ["text"] = text, ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }

    [RealtimeEvent("$disconnect")]
    public async Task OnDisconnect(JsonNode data)
    {
        var kv       = new KeyValueStore();
        var username = (await kv.Get($"{SocketId}:username"))?.ToString() ?? "Anonymous";
        await EmitAll("userLeft", new JsonObject { ["username"] = username });
    }
}
```

  </TabItem>
</Tabs>

### Live Notifications

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace('/notifications')

ns.socket.on('$connect', function () {
  const userId = ns.socket.handshake.auth.userId
  ns.socket.join(`user:${userId}`)
})

ns.socket.on('subscribe', function (data) {
  ns.socket.join(`topic:${data.topic}`)
})

ns.socket.on('notify', function (data) {
  if (data.userId) {
    ns.to(`user:${data.userId}`).emit('notification', data.payload)
  } else if (data.topic) {
    ns.to(`topic:${data.topic}`).emit('notification', data.payload)
  }
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace('/notifications')

ns.socket.on('$connect', function () {
  const userId = (ns.socket.handshake.auth as { userId: string }).userId
  ns.socket.join(`user:${userId}`)
})

ns.socket.on('subscribe', function (data: { topic: string }) {
  ns.socket.join(`topic:${data.topic}`)
})

ns.socket.on('notify', function (data: { userId?: string; topic?: string; payload: unknown }) {
  if (data.userId) {
    ns.to(`user:${data.userId}`).emit('notification', data.payload)
  } else if (data.topic) {
    ns.to(`topic:${data.topic}`).emit('notification', data.payload)
  }
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class Notifications : RealtimeNamespace
{
    public override string Namespace => "/notifications";

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode data)
    {
        var userId = data["auth"]?["userId"]?.GetValue<string>();
        if (userId != null) await JoinRoom($"user:{userId}");
    }

    [RealtimeEvent("subscribe")]
    public async Task OnSubscribe(JsonNode data)
    {
        var topic = data["topic"]?.GetValue<string>();
        if (topic != null) await JoinRoom($"topic:{topic}");
    }

    [RealtimeEvent("notify")]
    public async Task OnNotify(JsonNode data)
    {
        var userId  = data["userId"]?.GetValue<string>();
        var topic   = data["topic"]?.GetValue<string>();
        var payload = data["payload"];
        if (userId != null)       await To($"user:{userId}").Emit("notification", payload);
        else if (topic != null)   await To($"topic:{topic}").Emit("notification", payload);
    }
}
```

  </TabItem>
</Tabs>

### Presence (Online/Offline)

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace('/presence')

ns.socket.on('$connect', function () {
  const userId = ns.socket.handshake.auth.userId
  ns.socket.data.userId = userId
  ns.socket.join('online')
  ns.socket.to('online').emit('status', { userId, status: 'online' })
})

ns.socket.on('$disconnect', function () {
  ns.to('online').emit('status', {
    userId: ns.socket.data.userId,
    status: 'offline'
  })
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace('/presence')

ns.socket.on('$connect', function () {
  const userId = (ns.socket.handshake.auth as { userId: string }).userId
  ns.socket.data.userId = userId
  ns.socket.join('online')
  ns.socket.to('online').emit('status', { userId, status: 'online' })
})

ns.socket.on('$disconnect', function () {
  ns.to('online').emit('status', {
    userId: ns.socket.data.userId as string,
    status: 'offline'
  })
})

export default ns
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class Presence : RealtimeNamespace
{
    public override string Namespace => "/presence";

    [RealtimeEvent("$connect")]
    public async Task OnConnect(JsonNode data)
    {
        var kv     = new KeyValueStore();
        var userId = data["auth"]?["userId"]?.GetValue<string>();
        if (userId is null) return;
        await kv.Set($"{SocketId}:userId", userId);
        await To("online").Emit("status", new JsonObject { ["userId"] = userId, ["status"] = "online" });
    }

    [RealtimeEvent("$disconnect")]
    public async Task OnDisconnect(JsonNode data)
    {
        var kv     = new KeyValueStore();
        var userId = (await kv.Get($"{SocketId}:userId"))?.ToString();
        if (userId is null) return;
        await To("online").Emit("status", new JsonObject { ["userId"] = userId, ["status"] = "offline" });
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

1. **Keep handlers fast** — each event triggers a function invocation. Avoid heavy computation or long-running work inside handlers.

2. **Use rooms for grouping** — rooms are lightweight and the most efficient way to broadcast to subsets of clients.

3. **Store state in `socket.data`** — use it for per-connection metadata like usernames or session info. Remember it's in-memory and only available during the connection lifetime.

4. **Use the KV store for persistent state** — `socket.data` is lost on disconnect. For data that needs to survive across connections, use the [KV Store](/docs/api/bun/kv-store).

5. **Validate event data** — clients can send arbitrary payloads. Always validate incoming data before acting on it.

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
ns.socket.on('message', function (data) {
  if (!data || typeof data.text !== 'string' || data.text.length > 1000) {
    return // Ignore invalid messages
  }
  ns.socket.to('general').emit('message', { text: data.text })
})
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
ns.socket.on('message', function (data: unknown) {
  if (!data || typeof (data as any).text !== 'string' || (data as any).text.length > 1000) {
    return
  }
  ns.socket.to('general').emit('message', { text: (data as { text: string }).text })
})
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
[RealtimeEvent("message")]
public async Task OnMessage(JsonNode data)
{
    var text = data["text"]?.GetValue<string>();
    if (string.IsNullOrEmpty(text) || text.Length > 1000) return;
    await To("general").Emit("message", new JsonObject { ["text"] = text });
}
```

  </TabItem>
</Tabs>

6. **Handle disconnects gracefully** — use the `$disconnect` handler to clean up rooms and notify other clients.

7. **Scope namespaces by feature** — use separate namespaces for separate concerns (e.g. `/chat`, `/notifications`, `/presence`) rather than multiplexing everything on a single namespace.

## Next Steps

- [Realtime APIs (Bun)](/docs/api/bun/realtime) — Full API reference with all methods and properties
- [Realtime Chat Example](/docs/examples/realtime-chat) — Complete chat application walkthrough
- [KV Store](/docs/api/bun/kv-store) — Persist data across connections

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Realtime Chat

A complete chat application with rooms, usernames, and typing indicators using `RealtimeNamespace`.

## Overview

This example builds a multi-room chat where clients can:

- Connect with a username
- Join and leave rooms
- Send messages to a room
- See typing indicators
- Receive join/leave notifications

## Function Code

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', async function () {
  const username = ns.socket.handshake.auth.username || 'Anonymous'
  await kv.set(`${ns.socket.id}:username`, username)
  await kv.set(`${ns.socket.id}:currentRoom`, null)
  ns.socket.emit('welcome', { message: `Welcome, ${username}!`, socketId: ns.socket.id })
})

ns.socket.on('joinRoom', async function (data) {
  if (!data || typeof data.room !== 'string') return
  const room = data.room
  const currentRoom = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (currentRoom) {
    ns.socket.to(currentRoom).emit('userLeft', { username })
    ns.socket.leave(currentRoom)
  }
  ns.socket.join(room)
  await kv.set(`${ns.socket.id}:currentRoom`, room)
  ns.socket.to(room).emit('userJoined', { username })
  ns.socket.emit('joinedRoom', { room })
})

ns.socket.on('message', async function (data) {
  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (!room || !data?.text) return
  ns.to(room).emit('message', {
    username,
    text: data.text,
    timestamp: Date.now(),
    id: crypto.randomUUID()
  })
})

ns.socket.on('$disconnect', async function () {
  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (room) ns.socket.to(room).emit('userLeft', { username })
  await kv.delete(`${ns.socket.id}:username`)
  await kv.delete(`${ns.socket.id}:currentRoom`)
})

export default ns
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', async () => {
  const username = (ns.socket.handshake.auth as { username?: string }).username ?? 'Anonymous'
  await kv.set(`${ns.socket.id}:username`, username)
  await kv.set(`${ns.socket.id}:currentRoom`, null)
  ns.socket.emit('welcome', { message: `Welcome, ${username}!`, socketId: ns.socket.id })
})

ns.socket.on('joinRoom', async (data: { room: string }) => {
  if (!data?.room) return
  const room = data.room
  const currentRoom = (await kv.get(`${ns.socket.id}:currentRoom`)) as string | null
  const username = (await kv.get(`${ns.socket.id}:username`)) as string
  if (currentRoom) {
    ns.socket.to(currentRoom).emit('userLeft', { username })
    ns.socket.leave(currentRoom)
  }
  ns.socket.join(room)
  await kv.set(`${ns.socket.id}:currentRoom`, room)
  ns.socket.to(room).emit('userJoined', { username })
  ns.socket.emit('joinedRoom', { room })
})

ns.socket.on('message', async (data: { text: string }) => {
  const room = (await kv.get(`${ns.socket.id}:currentRoom`)) as string | null
  const username = (await kv.get(`${ns.socket.id}:username`)) as string
  if (!room || !data?.text) return
  ns.to(room).emit('message', {
    username,
    text: data.text,
    timestamp: Date.now(),
    id: crypto.randomUUID()
  })
})

ns.socket.on('$disconnect', async () => {
  const room = (await kv.get(`${ns.socket.id}:currentRoom`)) as string | null
  const username = (await kv.get(`${ns.socket.id}:username`)) as string
  if (room) ns.socket.to(room).emit('userLeft', { username })
  await kv.delete(`${ns.socket.id}:username`)
  await kv.delete(`${ns.socket.id}:currentRoom`)
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
    public async Task OnConnect(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        var username = req.Body?["auth"]?["username"]?.GetValue<string>() ?? "Anonymous";
        await kv.Set($"{SocketId}:username", username);
        await kv.Set($"{SocketId}:currentRoom", "");
        await Emit("welcome", new JsonObject { ["message"] = $"Welcome, {username}!", ["socketId"] = SocketId });
    }

    [RealtimeEvent("joinRoom")]
    public async Task OnJoinRoom(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        var room = req.Body?["room"]?.GetValue<string>();
        if (string.IsNullOrEmpty(room)) return;

        var currentRoom = (await kv.Get($"{SocketId}:currentRoom"))?.ToString();
        var username = (await kv.Get($"{SocketId}:username"))?.ToString() ?? "Anonymous";

        if (!string.IsNullOrEmpty(currentRoom))
            await To(currentRoom).Emit("userLeft", new JsonObject { ["username"] = username });

        await kv.Set($"{SocketId}:currentRoom", room);
        await To(room).Emit("userJoined", new JsonObject { ["username"] = username });
        await Emit("joinedRoom", new JsonObject { ["room"] = room });
    }

    [RealtimeEvent("message")]
    public async Task OnMessage(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        var text = req.Body?["text"]?.GetValue<string>();
        var room = (await kv.Get($"{SocketId}:currentRoom"))?.ToString();
        var username = (await kv.Get($"{SocketId}:username"))?.ToString() ?? "Anonymous";
        if (string.IsNullOrEmpty(room) || string.IsNullOrEmpty(text)) return;

        await To(room).Emit("message", new JsonObject
        {
            ["username"]  = username,
            ["text"]      = text,
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["id"]        = Guid.NewGuid().ToString()
        });
    }

    [RealtimeEvent("$disconnect")]
    public async Task OnDisconnect(InvokeRequest req, InvokeResponse res)
    {
        var kv = new KeyValueStore();
        var room = (await kv.Get($"{SocketId}:currentRoom"))?.ToString();
        var username = (await kv.Get($"{SocketId}:username"))?.ToString() ?? "Anonymous";
        if (!string.IsNullOrEmpty(room))
            await To(room).Emit("userLeft", new JsonObject { ["username"] = username });
        await kv.Delete($"{SocketId}:username");
        await kv.Delete($"{SocketId}:currentRoom");
    }
}
```

  </TabItem>
</Tabs>

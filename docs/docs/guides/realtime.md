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

```javascript
const ns = new RealtimeNamespace();

ns.socket.on('$connect', function () {
    console.log('Connected:', ns.socket.id);
    ns.socket.emit('welcome', { message: 'Hello!' });
});

ns.socket.on('message', function (data) {
    // Broadcast to all other sockets in the namespace
    ns.socket.broadcast.emit('message', {
        from: ns.socket.id,
        text: data.text,
    });
});

ns.socket.on('$disconnect', function (reason) {
    console.log('Disconnected:', ns.socket.id, reason);
});

module.exports = ns;
```

**Note:** `RealtimeNamespace` is a global — no `require()` needed.

## Rooms

Rooms let you group sockets for targeted broadcasting. A socket can be in multiple rooms at once.

### Joining and Leaving

```javascript
ns.socket.on('joinRoom', function (data) {
    ns.socket.join(data.room);
    ns.socket.emit('joined', { room: data.room });

    // Tell others in the room
    ns.socket.to(data.room).emit('userJoined', {
        socketId: ns.socket.id,
    });
});

ns.socket.on('leaveRoom', function (data) {
    ns.socket.to(data.room).emit('userLeft', {
        socketId: ns.socket.id,
    });
    ns.socket.leave(data.room);
});
```

### Broadcasting to a Room

```javascript
ns.socket.on('message', function (data) {
    // Send to everyone in the room except the sender
    ns.socket.to(data.room).emit('message', {
        from: ns.socket.id,
        text: data.text,
    });
});
```

### Multi-Room Targeting

```javascript
// Send to sockets in room1 OR room2
ns.socket.to('room1').to('room2').emit('announcement', { text: 'Hello both rooms!' });

// Send to room1 but exclude room2
ns.socket.to('room1').except('room2').emit('exclusive', { text: 'Only room1' });
```

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
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    },
});
```

In your function, access the auth payload through the handshake:

```javascript
ns.socket.on('$connect', function () {
    const token = ns.socket.handshake.auth.token;
    const userId = ns.socket.handshake.query.userId;
    console.log('Authenticated with token:', token);
});
```

If authentication fails, the gateway disconnects the client before the `$connect` handler runs.

## Broadcasting Patterns

### To a specific socket

```javascript
ns.socket.emit('directMessage', { text: 'Just for you' });
```

### To a room (excluding sender)

```javascript
ns.socket.to('general').emit('chat', { text: 'Hello room' });
```

### To all (excluding sender)

```javascript
ns.socket.broadcast.emit('announcement', { text: 'News flash' });
```

### To entire namespace (including sender)

```javascript
ns.emit('serverNotice', { text: 'Server restart in 5 minutes' });
```

### To multiple rooms

```javascript
ns.socket.to('admins').to('moderators').emit('alert', { level: 'high' });
```

### To a room, excluding another room

```javascript
ns.to('premium').except('banned').emit('offer', { discount: 20 });
```

## Client Connection

Connect from a browser using the [socket.io-client](https://www.npmjs.com/package/socket.io-client) library:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
    const socket = io('https://gateway.example.com/myapp/chat', {
        auth: { token: 'your-auth-token' },
    });

    socket.on('connect', () => {
        console.log('Connected:', socket.id);
    });

    socket.on('welcome', (data) => {
        console.log(data.message);
    });

    socket.on('message', (data) => {
        console.log(`${data.from}: ${data.text}`);
    });

    // Send a message
    socket.emit('message', { text: 'Hello everyone!' });

    // Join a room
    socket.emit('joinRoom', { room: 'general' });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
    });
</script>
```

Or with a bundler (npm):

```javascript
import { io } from 'socket.io-client';

const socket = io('https://gateway.example.com/myapp/chat', {
    auth: { token: localStorage.getItem('authToken') },
});

socket.on('connect', () => console.log('Connected'));
socket.on('message', (data) => console.log(data));
socket.emit('message', { text: 'Hello!' });
```

**Connection URL format:** `https://<gateway-domain>/<project-slug><namespace-path>`

For custom domains, omit the project slug: `https://api.mysite.com/chat`

## Common Patterns

### Chat Room

```javascript
const ns = new RealtimeNamespace();

ns.socket.on('$connect', function () {
    ns.socket.data.username = ns.socket.handshake.auth.username || 'Anonymous';
    ns.socket.join('lobby');
    ns.socket.to('lobby').emit('userJoined', { username: ns.socket.data.username });
});

ns.socket.on('message', function (data) {
    ns.socket.to(data.room || 'lobby').emit('message', {
        from: ns.socket.data.username,
        text: data.text,
        timestamp: Date.now(),
    });
});

ns.socket.on('$disconnect', function () {
    ns.emit('userLeft', { username: ns.socket.data.username });
});

module.exports = ns;
```

### Live Notifications

```javascript
const ns = new RealtimeNamespace('/notifications');

ns.socket.on('$connect', function () {
    const userId = ns.socket.handshake.auth.userId;
    ns.socket.join(`user:${userId}`);
});

ns.socket.on('subscribe', function (data) {
    ns.socket.join(`topic:${data.topic}`);
});

ns.socket.on('notify', function (data) {
    if (data.userId) {
        ns.to(`user:${data.userId}`).emit('notification', data.payload);
    } else if (data.topic) {
        ns.to(`topic:${data.topic}`).emit('notification', data.payload);
    }
});

module.exports = ns;
```

### Presence (Online/Offline)

```javascript
const ns = new RealtimeNamespace('/presence');

ns.socket.on('$connect', function () {
    const userId = ns.socket.handshake.auth.userId;
    ns.socket.data.userId = userId;
    ns.socket.join('online');
    ns.socket.to('online').emit('status', { userId, status: 'online' });
});

ns.socket.on('$disconnect', function () {
    ns.to('online').emit('status', {
        userId: ns.socket.data.userId,
        status: 'offline',
    });
});

module.exports = ns;
```

## Best Practices

1. **Keep handlers fast** — each event triggers a function invocation. Avoid heavy computation or long-running work inside handlers.

2. **Use rooms for grouping** — rooms are lightweight and the most efficient way to broadcast to subsets of clients.

3. **Store state in `socket.data`** — use it for per-connection metadata like usernames or session info. Remember it's in-memory and only available during the connection lifetime.

4. **Use the KV store for persistent state** — `socket.data` is lost on disconnect. For data that needs to survive across connections, use the [KV Store](/docs/api/kv-store).

5. **Validate event data** — clients can send arbitrary payloads. Always validate incoming data before acting on it.

```javascript
ns.socket.on('message', function (data) {
    if (!data || typeof data.text !== 'string' || data.text.length > 1000) {
        return; // Ignore invalid messages
    }
    ns.socket.to('general').emit('message', { text: data.text });
});
```

6. **Handle disconnects gracefully** — use the `$disconnect` handler to clean up rooms and notify other clients.

7. **Scope namespaces by feature** — use separate namespaces for separate concerns (e.g. `/chat`, `/notifications`, `/presence`) rather than multiplexing everything on a single namespace.

## Next Steps

- [RealtimeNamespace API](/docs/api/realtime) — Full API reference with all methods and properties
- [Realtime Chat Example](/docs/examples/realtime-chat) — Complete chat application walkthrough
- [KV Store](/docs/api/kv-store) — Persist data across connections

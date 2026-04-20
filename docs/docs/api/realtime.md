# Realtime APIs

`RealtimeNamespace` is a globally available class that lets you build realtime, event-driven functions using the [Socket.IO](https://socket.io/) protocol. Clients connect via WebSocket and your function handles connection lifecycle events and custom events — with full support for rooms, broadcasting, and authentication.

A `RealtimeNamespace` instance is itself a function, so it can be used directly as your function's export:

```javascript
const ns = new RealtimeNamespace('/chat');

ns.socket.on('$connect', function () {
    console.log('Client connected:', ns.socket.id);
    ns.socket.join('general');
});

ns.socket.on('message', function (data) {
    ns.socket.to('general').emit('message', {
        from: ns.socket.id,
        text: data.text,
    });
});

ns.socket.on('$disconnect', function (reason) {
    console.log('Client disconnected:', ns.socket.id, reason);
});

export default ns;
```

## Creating a RealtimeNamespace

```javascript
const ns = new RealtimeNamespace('/chat');
```

The argument is the namespace path. This must match the namespace path you configure in the admin UI under **API Gateway → Realtime**. `RealtimeNamespace` is available as a global — no `require()` call is necessary.

```javascript
const ns = new RealtimeNamespace();
```

You can omit the namespace path if your function is set as a handler of a namespace in **API Gateway → Realtime**.

A `RealtimeNamespace` instance doubles as a request handler. When the gateway dispatches a socket event, it arrives as an internal HTTP request that `ns` handles automatically. For non-socket requests, it responds with 404 or passes to `next()` if used as middleware.

## Event Handlers

Register handlers on `ns.socket` to respond to socket events. Inside a handler, `this` refers to the `RealtimeNamespace` instance and `this.socket` gives you access to the current socket.

### ns.socket.on(event, handler)

Register a handler for a named event. Returns the socket for chaining.

```javascript
ns.socket.on('$connect', function () {
    console.log('New connection:', ns.socket.id);
});

ns.socket.on('chatMessage', function (data) {
    console.log('Received:', data);
});
```

### ns.socket.once(event, handler)

It is basically alias of `ns.socket.on(event, handler)`. In serverless environment, everything is stateless. Therefore, handler cannot be unregistered after first execution.

### Reserved Events

Two event names have special meaning:

| Event | When it fires | Handler receives |
|-------|--------------|-----------------|
| `$connect` | A client connects to the namespace | *(nothing)* |
| `$disconnect` | A client disconnects | `reason` (string) |

All other event names are custom events defined by your application. Each custom event handler receives the data the client sent as its arguments.

```javascript
ns.socket.on('$connect', function () {
    // No arguments — use ns.socket.handshake for connection metadata
});

ns.socket.on('$disconnect', function (reason) {
    console.log('Disconnected because:', reason);
    // reason: 'transport close', 'client namespace disconnect', etc.
});

ns.socket.on('move', function (data) {
    // data is whatever the client sent: { x: 10, y: 20 }
});
```

## Socket Properties

Inside an event handler, `ns.socket` is automatically hydrated with the current connection's details.

### ns.socket.id

The unique identifier for the connected socket.

```javascript
ns.socket.on('$connect', function () {
    console.log(ns.socket.id); // e.g. 'abc123xyz'
});
```

### ns.socket.rooms

A `Set` of room names the socket has joined. Every socket automatically joins a room matching its own `id`.

```javascript
ns.socket.on('$connect', function () {
    console.log(ns.socket.rooms); // Set { 'abc123xyz' }
    ns.socket.join('lobby');
    // rooms would be Set { 'abc123xyz', 'lobby' } on next event
});
```

### ns.socket.handshake

Metadata from the initial connection handshake:

```javascript
ns.socket.on('$connect', function () {
    const { headers, query, auth, address, time } = ns.socket.handshake;

    console.log(headers['user-agent']); // Client user-agent
    console.log(query.token);           // Query string params
    console.log(auth.userId);           // Auth payload from client
    console.log(address);               // Client IP address
});
```

| Property | Type | Description |
|----------|------|-------------|
| `headers` | `object` | HTTP headers from the initial handshake request |
| `query` | `object` | Query string parameters |
| `auth` | `object` | Authentication payload sent by the client |
| `address` | `string` | Client's IP address |
| `time` | `string` | Timestamp of the connection |

### ns.socket.data

An arbitrary object for storing per-socket state. Persists for the lifetime of the connection (in-memory only). Highly **not** recommended to use as the serverless function is stateless.

```javascript
ns.socket.on('$connect', function () {
    ns.socket.data.username = ns.socket.handshake.auth.username;
});

ns.socket.on('message', function (data) {
    console.log(ns.socket.data.username, 'says:', data.text);
});
```

### ns.socket.connected

Boolean indicating whether the socket is currently connected.

```javascript
ns.socket.on('$disconnect', function (reason) {
    console.log(ns.socket.connected); // false
});
```

## Socket Methods

### ns.socket.emit(event, ...args)

Send an event directly to this socket.

```javascript
ns.socket.on('$connect', function () {
    ns.socket.emit('welcome', { message: 'Hello!' });
});
```

**Returns:** `Promise<void>`

### ns.socket.join(room)

Add this socket to a room.

```javascript
ns.socket.on('joinRoom', function (data) {
    ns.socket.join(data.room);
    ns.socket.emit('joined', { room: data.room });
});
```

**Returns:** `Promise<void>`

### ns.socket.leave(room)

Remove this socket from a room.

```javascript
ns.socket.on('leaveRoom', function (data) {
    ns.socket.leave(data.room);
});
```

**Returns:** `Promise<void>`

### ns.socket.disconnect()

Force-disconnect this socket from the server.

```javascript
ns.socket.on('ban', function () {
    ns.socket.emit('banned', { reason: 'Violation' });
    ns.socket.disconnect();
});
```

**Returns:** `Promise<void>`

### ns.socket.to(room).emit(event, ...args)

Broadcast an event to all sockets in a room (excluding the sender).

```javascript
ns.socket.on('message', function (data) {
    ns.socket.to('general').emit('message', {
        from: ns.socket.id,
        text: data.text,
    });
});
```

### ns.socket.broadcast.emit(event, ...args)

Broadcast an event to all connected sockets in the namespace (excluding the sender).

```javascript
ns.socket.on('announcement', function (data) {
    ns.socket.broadcast.emit('announcement', data);
});
```

### ns.socket.except(room).emit(event, ...args)

Broadcast to all sockets in the namespace except those in the specified room.

```javascript
ns.socket.on('alert', function (data) {
    ns.socket.except('muted').emit('alert', data);
});
```

## Namespace Methods

These methods operate at the namespace level — they are not scoped to the current socket.

### ns.to(room).emit(event, ...args)

Broadcast to all sockets in a room (including the sender, unlike `socket.to()`).

```javascript
ns.socket.on('serverMessage', function (data) {
    ns.to('general').emit('serverMessage', data);
});
```

### ns.except(room).emit(event, ...args)

Broadcast to all sockets in the namespace except those in the specified room.

```javascript
ns.socket.on('maintenance', function () {
    ns.except('admins').emit('maintenance', { message: 'Going offline soon' });
});
```

### ns.emit(event, ...args)

Broadcast to every socket in the namespace.

```javascript
ns.socket.on('globalAlert', function (data) {
    ns.emit('globalAlert', data);
});
```

**Note:** `ns.join()`, `ns.leave()`, and `ns.broadcast` are not available at the namespace level — use `ns.socket.join()`, `ns.socket.leave()`, and `ns.socket.broadcast` inside an event handler instead.

## Broadcast Chaining

The `to()` and `except()` methods return a `BroadcastOperator` that supports chaining for fine-grained targeting.

### Multi-room broadcast

```javascript
// Send to sockets in room1 OR room2
ns.socket.to('room1').to('room2').emit('update', data);
```

### Include and exclude

```javascript
// Send to room1, but not to anyone also in room2
ns.socket.to('room1').except('room2').emit('update', data);
```

### Namespace-level chaining

```javascript
// Namespace broadcast to two rooms, excluding a third
ns.to('vip').to('premium').except('banned').emit('offer', { discount: 20 });
```

## Complete Example

A group chat function with rooms, typing indicators, and private messages:

```javascript
const ns = new RealtimeNamespace('/chat');

ns.socket.on('$connect', function () {
    const username = ns.socket.handshake.auth.username || 'Anonymous';
    ns.socket.data.username = username;
    ns.socket.join('lobby');
    ns.socket.emit('welcome', { message: `Hello, ${username}!` });
    ns.socket.to('lobby').emit('userJoined', { username });
});

ns.socket.on('joinRoom', function (data) {
    ns.socket.leave('lobby');
    ns.socket.join(data.room);
    ns.socket.to(data.room).emit('userJoined', {
        username: ns.socket.data.username,
    });
});

ns.socket.on('message', function (data) {
    ns.socket.to(data.room || 'lobby').emit('message', {
        from: ns.socket.data.username,
        text: data.text,
        timestamp: Date.now(),
    });
});

ns.socket.on('typing', function (data) {
    ns.socket.to(data.room || 'lobby').emit('typing', {
        username: ns.socket.data.username,
    });
});

ns.socket.on('privateMessage', function (data) {
    ns.socket.emit('privateMessage', {
        from: ns.socket.data.username,
        text: data.text,
    });
    // Also send to the target socket directly
    ns.to(data.targetSocketId).emit('privateMessage', {
        from: ns.socket.data.username,
        text: data.text,
    });
});

ns.socket.on('$disconnect', function (reason) {
    ns.emit('userLeft', {
        username: ns.socket.data.username,
        reason,
    });
});

export default ns;
```

## Reference

### RealtimeNamespace

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `new RealtimeNamespace(namespacePath)` | Create a new namespace handler |
| `to` | `.to(room)` | Target a room (returns BroadcastOperator) |
| `in` | `.in(room)` | Alias for `to()` |
| `except` | `.except(room)` | Exclude a room (returns BroadcastOperator) |
| `emit` | `.emit(event, ...args)` | Broadcast to entire namespace |

### Socket (ns.socket)

| Method / Property | Signature | Description |
|-------------------|-----------|-------------|
| `id` | `string` | Unique socket identifier |
| `rooms` | `Set<string>` | Rooms this socket belongs to |
| `handshake` | `object` | Connection metadata (headers, query, auth, address, time) |
| `data` | `object` | Arbitrary per-socket storage |
| `connected` | `boolean` | Whether the socket is connected |
| `on` | `.on(event, handler)` | Register an event handler |
| `once` | `.once(event, handler)` | Register a one-time handler |
| `emit` | `.emit(event, ...args)` | Send to this socket |
| `join` | `.join(room)` | Join a room |
| `leave` | `.leave(room)` | Leave a room |
| `disconnect` | `.disconnect()` | Force-disconnect this socket |
| `to` | `.to(room)` | Target a room (returns BroadcastOperator) |
| `in` | `.in(room)` | Alias for `to()` |
| `except` | `.except(room)` | Exclude a room (returns BroadcastOperator) |
| `broadcast` | `.broadcast` | BroadcastOperator excluding this socket |

### BroadcastOperator

| Method | Signature | Description |
|--------|-----------|-------------|
| `to` | `.to(room)` | Add a room to target (chainable) |
| `in` | `.in(room)` | Alias for `to()` |
| `except` | `.except(room)` | Add a room to exclude (chainable) |
| `emit` | `.emit(event, ...args)` | Send the event to matching sockets |

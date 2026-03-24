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

Create a function and map it to the `$connect`, `$disconnect`, `joinRoom`, `leaveRoom`, `message`, and `typing` events in your namespace configuration.

```javascript
const ns = new RealtimeNamespace('/chat');

// ─── Connection ──────────────────────────────────────────────────

ns.socket.on('$connect', function () {
    const username = ns.socket.handshake.auth.username || 'Anonymous';
    ns.socket.data.username = username;
    ns.socket.data.currentRoom = null;

    ns.socket.emit('welcome', {
        message: `Welcome, ${username}!`,
        socketId: ns.socket.id,
    });
});

// ─── Room Management ─────────────────────────────────────────────

ns.socket.on('joinRoom', function (data) {
    if (!data || typeof data.room !== 'string') return;

    const room = data.room;

    // Leave current room if already in one
    if (ns.socket.data.currentRoom) {
        ns.socket.to(ns.socket.data.currentRoom).emit('userLeft', {
            username: ns.socket.data.username,
        });
        ns.socket.leave(ns.socket.data.currentRoom);
    }

    ns.socket.join(room);
    ns.socket.data.currentRoom = room;

    ns.socket.emit('joinedRoom', { room });
    ns.socket.to(room).emit('userJoined', {
        username: ns.socket.data.username,
    });
});

ns.socket.on('leaveRoom', function () {
    const room = ns.socket.data.currentRoom;
    if (!room) return;

    ns.socket.to(room).emit('userLeft', {
        username: ns.socket.data.username,
    });
    ns.socket.leave(room);
    ns.socket.data.currentRoom = null;

    ns.socket.emit('leftRoom', { room });
});

// ─── Messaging ───────────────────────────────────────────────────

ns.socket.on('message', function (data) {
    if (!data || typeof data.text !== 'string' || !data.text.trim()) return;
    if (data.text.length > 2000) return;

    const room = ns.socket.data.currentRoom;
    if (!room) {
        ns.socket.emit('error', { message: 'Join a room first' });
        return;
    }

    const message = {
        from: ns.socket.data.username,
        text: data.text.trim(),
        timestamp: Date.now(),
    };

    // Send to everyone in the room including the sender
    ns.to(room).emit('message', message);
});

ns.socket.on('typing', function () {
    const room = ns.socket.data.currentRoom;
    if (!room) return;

    ns.socket.to(room).emit('typing', {
        username: ns.socket.data.username,
    });
});

// ─── Disconnect ──────────────────────────────────────────────────

ns.socket.on('$disconnect', function (reason) {
    const room = ns.socket.data.currentRoom;
    if (room) {
        ns.to(room).emit('userLeft', {
            username: ns.socket.data.username,
        });
    }
});

module.exports = ns;
```

## Namespace Configuration

In the admin UI (**API Gateway → Realtime → Add Namespace**):

| Setting | Value |
|---------|-------|
| Namespace Path | `/chat` |
| Active | Yes |

Map **all event handlers** to the same function:

| Event | Function |
|-------|----------|
| `$connect` | `chat-handler` |
| `$disconnect` | `chat-handler` |
| `joinRoom` | `chat-handler` |
| `leaveRoom` | `chat-handler` |
| `message` | `chat-handler` |
| `typing` | `chat-handler` |

## Client Code

A minimal HTML client that connects and interacts with the chat:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoke Chat</title>
    <style>
        body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; }
        #messages { border: 1px solid #ccc; height: 300px; overflow-y: auto; padding: 0.5rem; margin-bottom: 1rem; }
        .msg { margin: 0.25rem 0; }
        .system { color: #888; font-style: italic; }
        input, button { padding: 0.4rem 0.8rem; }
    </style>
</head>
<body>
    <h1>Chat</h1>
    <div>
        <input id="username" placeholder="Username" value="User1" />
        <input id="room" placeholder="Room" value="general" />
        <button onclick="connect()">Connect</button>
        <button onclick="joinRoom()">Join Room</button>
    </div>
    <div id="messages"></div>
    <div>
        <input id="text" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendMessage()" oninput="sendTyping()" />
        <button onclick="sendMessage()">Send</button>
    </div>
    <div id="typing" style="color:#888; height:1.2em;"></div>

    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <script>
        let socket;
        const messagesEl = document.getElementById('messages');
        const typingEl = document.getElementById('typing');

        function log(text, cls) {
            const div = document.createElement('div');
            div.className = 'msg ' + (cls || '');
            div.textContent = text;
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function connect() {
            const username = document.getElementById('username').value;
            // Replace with your gateway URL and project slug
            socket = io('https://gateway.example.com/myproject/chat', {
                auth: { username },
            });

            socket.on('connect', () => log('Connected as ' + username, 'system'));
            socket.on('welcome', (d) => log(d.message, 'system'));
            socket.on('userJoined', (d) => log(d.username + ' joined', 'system'));
            socket.on('userLeft', (d) => log(d.username + ' left', 'system'));
            socket.on('joinedRoom', (d) => log('Joined room: ' + d.room, 'system'));
            socket.on('message', (d) => log(d.from + ': ' + d.text));
            socket.on('typing', (d) => {
                typingEl.textContent = d.username + ' is typing...';
                clearTimeout(typingEl._timer);
                typingEl._timer = setTimeout(() => { typingEl.textContent = ''; }, 2000);
            });
            socket.on('error', (d) => log('Error: ' + d.message, 'system'));
            socket.on('disconnect', (r) => log('Disconnected: ' + r, 'system'));
        }

        function joinRoom() {
            if (!socket) return;
            socket.emit('joinRoom', { room: document.getElementById('room').value });
        }

        function sendMessage() {
            if (!socket) return;
            const input = document.getElementById('text');
            if (!input.value.trim()) return;
            socket.emit('message', { text: input.value });
            input.value = '';
        }

        function sendTyping() {
            if (!socket) return;
            socket.emit('typing');
        }
    </script>
</body>
</html>
```

## Next Steps

- [RealtimeNamespace API](/docs/api/realtime) — Full API reference
- [Realtime Functions Guide](/docs/guides/realtime) — Architecture, rooms, auth, and best practices
- [KV Store](/docs/api/kv-store) — Persist chat history or user profiles

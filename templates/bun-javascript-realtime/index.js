const ns = new RealtimeNamespace('/chat')

// ─── Connection ──────────────────────────────────────────────────

ns.socket.on('$connect', async function () {
  const username = ns.socket.handshake.auth.username || 'Anonymous'

  await kv.set(`${ns.socket.id}:username`, username)
  await kv.set(`${ns.socket.id}:currentRoom`, null)

  ns.socket.emit('welcome', {
    message: `Welcome, ${username}!`,
    socketId: ns.socket.id
  })
})

// ─── Room Management ─────────────────────────────────────────────

ns.socket.on('joinRoom', async function (data) {
  if (!data || typeof data.room !== 'string') return

  const room = data.room
  const currentRoom = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)

  // Leave current room if already in one
  if (currentRoom) {
    ns.socket.to(currentRoom).emit('userLeft', { username })
    ns.socket.leave(currentRoom)
  }

  ns.socket.join(room)
  await kv.set(`${ns.socket.id}:currentRoom`, room)

  ns.socket.emit('joinedRoom', { room })
  ns.socket.to(room).emit('userJoined', { username })
})

ns.socket.on('leaveRoom', async function () {
  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (!room) return

  ns.socket.to(room).emit('userLeft', { username })
  ns.socket.leave(room)
  await kv.set(`${ns.socket.id}:currentRoom`, null)

  ns.socket.emit('leftRoom', { room })
})

// ─── Messaging ───────────────────────────────────────────────────

ns.socket.on('message', async function (data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim()) return
  if (data.text.length > 2000) return

  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)

  if (!room) {
    ns.socket.emit('error', { message: 'Join a room first' })
    return
  }

  const message = {
    from: username,
    text: data.text.trim(),
    timestamp: Date.now()
  }

  ns.to(room).emit('message', message)
})

ns.socket.on('typing', async function () {
  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (!room) return

  ns.socket.to(room).emit('typing', { username })
})

// ─── Disconnect ──────────────────────────────────────────────────

ns.socket.on('$disconnect', async function (reason) {
  const room = await kv.get(`${ns.socket.id}:currentRoom`)
  const username = await kv.get(`${ns.socket.id}:username`)
  if (room) {
    ns.to(room).emit('userLeft', { username })
  }
})

export default ns

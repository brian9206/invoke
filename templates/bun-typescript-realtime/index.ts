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

ns.socket.on('joinRoom', async function (data: any) {
  if (!data || typeof data.room !== 'string') return

  const room = data.room
  const currentRoom = (await kv.get(`${ns.socket.id}:currentRoom`)) as string | null
  const username = (await kv.get(`${ns.socket.id}:username`)) as string

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
  const room = (await kv.get(`${ns.socket.id}:currentRoom`)) as string | null
  const username = (await kv.get(`${ns.socket.id}:username`)) as string
  if (!room) return

  ns.socket.to(room).emit('userLeft', { username })
  ns.socket.leave(room)
  await kv.set(`${ns.socket.id}:currentRoom`, null)

  ns.socket.emit('leftRoom', { room })
})

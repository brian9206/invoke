# Global APIs

Invoke provides several global objects and functions that are available in all functions without requiring any modules.

## Logger

Structured logging is natively supported via the built-in Pino instance, accessible as `logger`.

```javascript
logger.info({ foo: 'bar' })
logger.error('%s has won %d dollars!', 'Brian', 100000)
logger.warn(req, 'Request object')
logger.debug('%j', { id: 1, name: 'Alice' }) // serialises object to JSON string

const child = logger.child({ module: 'auth-service' })
child.info('hello world')
```

For more details, please refer to [Pino API Logger Instance Reference](https://getpino.io/#/docs/api?id=logger).

## Router

Express.js-compatible router for handling multiple routes and middleware in a single function:

```javascript
const router = new Router()

router.get('/', (req, res) => res.json({ ok: true }))
router.get('/users/:id', (req, res) => res.json({ id: req.params.id }))
router.post('/users', async (req, res) => {
  res.status(201).json(req.body)
})
router.use((req, res) => res.status(404).send('Not found'))

export default router
```

See the [Router API](/docs/api/bun/router) for full documentation.

## RealtimeNamespace

Socket.IO-compatible realtime namespace for building event-driven functions with rooms, broadcasting, and authentication:

```javascript
const ns = new RealtimeNamespace('/chat')

ns.socket.on('$connect', function () {
  ns.socket.join('lobby')
  ns.socket.emit('welcome', { message: 'Hello!' })
})

ns.socket.on('message', function (data) {
  ns.socket.to('lobby').emit('message', { from: ns.socket.id, text: data.text })
})

ns.socket.on('$disconnect', function (reason) {
  console.log('Left:', ns.socket.id, reason)
})

export default ns
```

See the [Realtime APIs](/docs/api/bun/realtime) for full documentation.

## Standard Modules

Standard Node.js-compatible modules available in the sandbox:

```javascript
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import utils from './lib/utils.js'
import lodash from 'lodash'
import config from './config.json'

export default function handler(req, res) {
  res.json({ loaded: true })
}
```

User code executes on the Bun runtime. For detailed guidance, please consult the [Bun API Reference](https://bun.com/reference). Bun offers full backward compatibility with the Node.js API.

## Next Steps

- [Request Object](/docs/api/bun/request) - HTTP request API
- [Response Object](/docs/api/bun/response) - HTTP response API
- [KV Store](/docs/api/bun/kv-store) - Persistent storage
- [.NET API Reference](/docs/api/dotnet/overview) - C# SDK documentation

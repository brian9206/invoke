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

## invoke.serve

`invoke.serve.*` provides helper middleware factories for serving different kind of application. The middlewares provided can be used as `Router` handler and middleware. Also, they can be directly act as your function entry.

### invoke.serve.static(root, options?)

Serves files from a directory using the request path.

```javascript
import path from 'path'

const publicDir = path.join(process.cwd(), 'public')

export default invoke.serve.static(publicDir, {
  maxAge: '1h',
  etag: true,
  immutable: false
})
```

Behavior notes:

- With `fallthrough: false` (default), missing files return the built-in HTML 404 page.
- With `fallthrough: true`, missing files call `next()` so you can add your own fallback middleware.

Options:

| Option         | Type                            | Description                                                          | Default                 |
| -------------- | ------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| `acceptRanges` | `boolean`                       | Enable/disable range requests (`Accept-Ranges`).                     | `true`                  |
| `cacheControl` | `boolean`                       | Enable/disable `Cache-Control` header.                               | `true`                  |
| `dotfiles`     | `'allow' \| 'deny' \| 'ignore'` | Dotfile handling behavior.                                           | `'ignore'`              |
| `etag`         | `boolean`                       | Enable/disable ETag generation.                                      | `true`                  |
| `extensions`   | `string[] \| false`             | Extension fallbacks (for example `['html', 'htm']`).                 | `false`                 |
| `fallthrough`  | `boolean`                       | On client errors/missing files, pass to next middleware when `true`. | `false`                 |
| `immutable`    | `boolean`                       | Add `immutable` cache directive (typically with `maxAge`).           | N/A                     |
| `index`        | `boolean \| string \| string[]` | Directory index file(s).                                             | `'index.html'` behavior |
| `lastModified` | `boolean`                       | Enable/disable `Last-Modified` header.                               | `true`                  |
| `maxAge`       | `number \| string`              | Cache max age (milliseconds or `ms`-style string).                   | `0`                     |
| `redirect`     | `boolean`                       | Redirect directory paths to trailing slash.                          | `true`                  |
| `setHeaders`   | `(res, path, stat) => any`      | Synchronous hook to set response headers per file.                   | N/A                     |

### invoke.serve.spa(root, options?)

Serves static assets and rewrites non-file requests to your SPA entry document.

```javascript
import path from 'path'

const distDir = path.join(process.cwd(), 'dist')

export default invoke.serve.spa(distDir, {
  index: '/index.html',
  disableDotRule: false,
  rewrites: [{ from: /^\/admin/, to: '/index.html' }]
})
```

Behavior notes:

- HTML route requests are rewritten to the configured `index`.
- Static assets still come from disk normally.
- The index file is sent with no-cache headers; other static assets default to long-lived caching (`maxAge: '1y'`, `immutable: true`).

Options:

| Option              | Type                                                           | Description                              | Default                                  |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `index`             | `string`                                                       | SPA entry path for history fallback.     | `'/index.html'`                          |
| `disableDotRule`    | `true`                                                         | Disable dot-rule in history fallback.    | `false`                                  |
| `htmlAcceptHeaders` | `string[]`                                                     | Accept headers treated as HTML requests. | `['text/html', 'application/xhtml+xml']` |
| `rewrites`          | `Array<{ from: RegExp; to: string \| ((context) => string) }>` | History fallback rewrites.               | N/A                                      |
| `verbose`           | `boolean`                                                      | Enable verbose history fallback logging. | `false`                                  |

`invoke.serve.spa` also supports all `invoke.serve.static` options:

| Also supported from `invoke.serve.static`                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `acceptRanges`, `cacheControl`, `dotfiles`, `etag`, `extensions`, `fallthrough`, `immutable`, `lastModified`, `maxAge`, `redirect`, `setHeaders` |

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
- [File Serving Guide](/docs/guides/file-serving) - Static files and SPA routing
- [KV Store](/docs/api/bun/kv-store) - Persistent storage
- [.NET API Reference](/docs/api/dotnet/overview) - C# SDK documentation

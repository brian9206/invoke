# Router

`Router` is a globally available class that provides Express.js-compatible routing for your functions. It lets you define method-specific handlers and middleware, with full support for path parameters and wildcards, powered by [`path-to-regexp`](https://github.com/pillarjs/path-to-regexp).

A `Router` instance is itself a function, so it can be used directly as your function's export:

```javascript
const router = new Router();

router.get('/', (req, res) => {
    res.json({ message: 'Hello, world!' });
});

export default router;
```

## Creating a Router

```javascript
const router = new Router();
```

No arguments are needed. `Router` is available as a global — no `require()` call is necessary.

## HTTP Method Handlers

Register handlers for specific HTTP methods and paths.

```javascript
router.get(path, ...handlers)
router.post(path, ...handlers)
router.put(path, ...handlers)
router.patch(path, ...handlers)
router.delete(path, ...handlers)
router.options(path, ...handlers)
router.head(path, ...handlers)
router.all(path, ...handlers)  // matches any HTTP method
```

### Example

```javascript
const router = new Router();

router.get('/users', (req, res) => {
    res.json({ users: [] });
});

router.post('/users', (req, res) => {
    const { name } = req.body;
    res.status(201).json({ id: 1, name });
});

router.delete('/users/:id', (req, res) => {
    res.status(204).end();
});

export default router;
```

## Path Parameters

Use `:name` syntax to capture segments from the path. Captured values are available on `req.params`.

```javascript
router.get('/users/:id', (req, res) => {
    res.json({ userId: req.params.id });
});

router.get('/posts/:postId/comments/:commentId', (req, res) => {
    res.json({
        postId: req.params.postId,
        commentId: req.params.commentId,
    });
});
```

## Wildcard Matching

Use `*` to match any remaining path segments.

```javascript
router.get('/files/*', (req, res) => {
    res.json({ path: req.params[0] });
});
```

## Middleware

`router.use()` registers middleware that runs for all matching requests. Unlike method handlers, `use()` matches by **path prefix** — a handler registered for `/api` will run for `/api`, `/api/users`, `/api/users/123`, etc.

```javascript
// Run for all requests
router.use((req, res, next) => {
    console.log(req.method, req.path);
    next();
});

// Run for /api prefix only
router.use('/api', (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    next();
});
```

If a middleware does not call `next()`, the request chain stops there. If it calls `next(error)`, a 500 error is sent.

## Chaining

All registration methods return the router instance for chaining.

```javascript
const router = new Router();

router
    .get('/', (req, res) => res.send('Home'))
    .get('/about', (req, res) => res.send('About'))
    .post('/contact', (req, res) => res.json({ ok: true }));

export default router;
```

## Async Handlers

Handlers can be `async` functions. Errors thrown inside async handlers are caught and result in a 500 response.

```javascript
router.get('/data', async (req, res) => {
    const data = await fetch('https://api.example.com/data').then(r => r.json());
    res.json(data);
});
```

## Multiple Handlers

You can pass multiple handlers to any method. Each must call `next()` to pass control to the next handler.

```javascript
function authenticate(req, res, next) {
    if (!req.headers['authorization']) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

router.get('/protected', authenticate, (req, res) => {
    res.json({ secret: 'data' });
});
```

## Fallback (404 Handler)

Register a `use()` handler at the end of the chain to catch unmatched requests.

```javascript
router.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});
```

Without a fallback, the router automatically responds with `404 Cannot METHOD /path`.

## Complete Example

```javascript
const router = new Router();

// Logging middleware
router.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Routes
router.get('/', (req, res) => {
    res.json({ status: 'ok' });
});

router.get('/users/:id', async (req, res) => {
    const user = await kv.get(`user:${req.params.id}`);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

router.post('/users', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
    }
    const id = crypto.randomUUID();
    await kv.set(`user:${id}`, { id, name, email });
    res.status(201).json({ id, name, email });
});

router.delete('/users/:id', async (req, res) => {
    await kv.delete(`user:${req.params.id}`);
    res.status(204).end();
});

// 404 fallback
router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

export default router;
```

## Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(path, ...handlers)` | Handle GET requests |
| `post` | `(path, ...handlers)` | Handle POST requests |
| `put` | `(path, ...handlers)` | Handle PUT requests |
| `patch` | `(path, ...handlers)` | Handle PATCH requests |
| `delete` | `(path, ...handlers)` | Handle DELETE requests |
| `options` | `(path, ...handlers)` | Handle OPTIONS requests |
| `head` | `(path, ...handlers)` | Handle HEAD requests |
| `all` | `(path, ...handlers)` | Handle any HTTP method |
| `use` | `([path], ...handlers)` | Register middleware (prefix match) |

# REST API Example

Complete REST API implementation with CRUD operations.

## Using the Router

The `Router` global provides clean, Express.js-style routing with path parameter support:

```javascript
const router = new Router();

// In-memory storage (use KV store in production)
let items = [
    { id: 1, name: 'Item 1', description: 'First item' },
    { id: 2, name: 'Item 2', description: 'Second item' },
];
let nextId = 3;

// LIST: GET /
router.get('/', (req, res) => {
    res.json({ items, count: items.length });
});

// GET: GET /:id
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
});

// CREATE: POST /
router.post('/', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const newItem = { id: nextId++, name, description: description || '' };
    items.push(newItem);
    res.status(201).json({ item: newItem });
});

// UPDATE: PUT /:id
router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { name, description } = req.body;
    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    res.json({ item });
});

// DELETE: DELETE /:id
router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return res.status(404).json({ error: 'Item not found' });
    items.splice(index, 1);
    res.status(204).end();
});

// 404 fallback
router.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

export default router;
```

## Testing the API

### List Items
```bash
curl http://<your invoke-execution URL>/invoke/{functionId}
```

### Get Single Item
```bash
curl http://<your invoke-execution URL>/invoke/{functionId}/1
```

### Create Item
```bash
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{"name":"New Item","description":"A new item"}'
```

### Update Item
```bash
curl -X PUT http://<your invoke-execution URL>/invoke/{functionId}/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Item"}'
```

### Delete Item
```bash
curl -X DELETE http://<your invoke-execution URL>/invoke/{functionId}/1
```

## with KV Store Persistence

```javascript
const router = new Router();

router.get('/', async (req, res) => {
    const items = await kv.get('api:items') || [];
    res.json({ items, count: items.length });
});

router.get('/:id', async (req, res) => {
    const items = await kv.get('api:items') || [];
    const item = items.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
});

router.post('/', async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const items = await kv.get('api:items') || [];
    const nextId = (await kv.get('api:nextId')) || 1;
    const newItem = { id: nextId, name, description: description || '', createdAt: new Date().toISOString() };

    items.push(newItem);
    await kv.set('api:items', items);
    await kv.set('api:nextId', nextId + 1);
    res.status(201).json({ item: newItem });
});

router.put('/:id', async (req, res) => {
    const items = await kv.get('api:items') || [];
    const item = items.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { name, description } = req.body;
    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    item.updatedAt = new Date().toISOString();

    await kv.set('api:items', items);
    res.json({ item });
});

router.delete('/:id', async (req, res) => {
    const items = await kv.get('api:items') || [];
    const index = items.findIndex(i => i.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Item not found' });

    items.splice(index, 1);
    await kv.set('api:items', items);
    res.status(204).end();
});

router.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

export default router;
```

## With Pagination

```javascript
const router = new Router();

router.get('/', async (req, res) => {
    const items = await kv.get('api:items') || [];

    // Filter
    const search = req.query.search?.toLowerCase();
    let filtered = search
        ? items.filter(i =>
            i.name.toLowerCase().includes(search) ||
            i.description.toLowerCase().includes(search)
          )
        : items;

    // Sort
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = req.query.order === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
        if (a[sortBy] < b[sortBy]) return -sortOrder;
        if (a[sortBy] > b[sortBy]) return sortOrder;
        return 0;
    });

    // Paginate
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
        items: paginated,
        pagination: {
            page,
            limit,
            total: filtered.length,
            pages: Math.ceil(filtered.length / limit),
            hasNext: page * limit < filtered.length,
            hasPrev: page > 1,
        },
    });
});

export default router;
```

## Next Steps

- [KV Store Usage](/docs/examples/kv-store-usage) - Persistent storage
- [Request Object](/docs/api/request) - Handle requests
- [Response Object](/docs/api/response) - Send responses

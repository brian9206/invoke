# REST API Example

Complete REST API implementation with CRUD operations.

## Complete REST API

```javascript
// In-memory storage (use KV store in production)
let items = [
    { id: 1, name: 'Item 1', description: 'First item' },
    { id: 2, name: 'Item 2', description: 'Second item' }
];
let nextId = 3;

module.exports = function(req, res) {
    const path = req.path;
    const method = req.method;
    
    // LIST: GET /
    if (method === 'GET' && path === '/') {
        return res.json({ items, count: items.length });
    }
    
    // GET: GET /:id
    if (method === 'GET' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const item = items.find(i => i.id === id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        return res.json({ item });
    }
    
    // CREATE: POST /
    if (method === 'POST' && path === '/') {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const newItem = {
            id: nextId++,
            name,
            description: description || ''
        };
        
        items.push(newItem);
        return res.status(201).json({ item: newItem });
    }
    
    // UPDATE: PUT /:id
    if (method === 'PUT' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const item = items.find(i => i.id === id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const { name, description } = req.body;
        if (name) item.name = name;
        if (description !== undefined) item.description = description;
        
        return res.json({ item });
    }
    
    // DELETE: DELETE /:id
    if (method === 'DELETE' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const index = items.findIndex(i => i.id === id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        items.splice(index, 1);
        return res.status(204).end();
    }
    
    // Not found
    res.status(404).json({ error: 'Endpoint not found' });
};
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
module.exports = async function(req, res) {
    const path = req.path;
    const method = req.method;
    
    // Load items from KV store
    let items = await kv.get('api:items') || [];
    let nextId = await kv.get('api:nextId') || 1;
    
    // LIST
    if (method === 'GET' && path === '/') {
        return res.json({ items, count: items.length });
    }
    
    // GET
    if (method === 'GET' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const item = items.find(i => i.id === id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        return res.json({ item });
    }
    
    // CREATE
    if (method === 'POST' && path === '/') {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const newItem = {
            id: nextId++,
            name,
            description: description || '',
            createdAt: new Date().toISOString()
        };
        
        items.push(newItem);
        await kv.set('api:items', items);
        await kv.set('api:nextId', nextId);
        
        return res.status(201).json({ item: newItem });
    }
    
    // UPDATE
    if (method === 'PUT' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const item = items.find(i => i.id === id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const { name, description } = req.body;
        if (name) item.name = name;
        if (description !== undefined) item.description = description;
        item.updatedAt = new Date().toISOString();
        
        await kv.set('api:items', items);
        return res.json({ item });
    }
    
    // DELETE
    if (method === 'DELETE' && path.match(/^\/\d+$/)) {
        const id = parseInt(path.substring(1));
        const index = items.findIndex(i => i.id === id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        items.splice(index, 1);
        await kv.set('api:items', items);
        
        return res.status(204).end();
    }
    
    res.status(404).json({ error: 'Endpoint not found' });
};
```

## With Pagination

```javascript
module.exports = async function(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const items = await kv.get('api:items') || [];
    
    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Filter
    const search = req.query.search?.toLowerCase();
    let filtered = items;
    if (search) {
        filtered = items.filter(item => 
            item.name.toLowerCase().includes(search) ||
            item.description.toLowerCase().includes(search)
        );
    }
    
    // Sort
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = req.query.order === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
        if (a[sortBy] < b[sortBy]) return -sortOrder;
        if (a[sortBy] > b[sortBy]) return sortOrder;
        return 0;
    });
    
    // Paginate
    const paginated = filtered.slice(offset, offset + limit);
    
    res.json({
        items: paginated,
        pagination: {
            page,
            limit,
            total: filtered.length,
            pages: Math.ceil(filtered.length / limit),
            hasNext: page * limit < filtered.length,
            hasPrev: page > 1
        }
    });
};
```

## Next Steps

- [KV Store Usage](/docs/examples/kv-store-usage) - Persistent storage
- [Request Object](/docs/api/request) - Handle requests
- [Response Object](/docs/api/response) - Send responses

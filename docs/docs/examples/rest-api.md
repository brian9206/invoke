import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# REST API Example

Complete REST API implementation with CRUD operations.

## Using the Router

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
const router = new Router()

let items = [
  { id: 1, name: 'Item 1', description: 'First item' },
  { id: 2, name: 'Item 2', description: 'Second item' }
]
let nextId = 3

router.get('/', (req, res) => {
  res.json({ items, count: items.length })
})

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const item = items.find(i => i.id === id)
  if (!item) return res.status(404).json({ error: 'Item not found' })
  res.json({ item })
})

router.post('/', (req, res) => {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'Name is required' })
  const newItem = { id: nextId++, name, description: description || '' }
  items.push(newItem)
  res.status(201).json({ item: newItem })
})

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const item = items.find(i => i.id === id)
  if (!item) return res.status(404).json({ error: 'Item not found' })
  const { name, description } = req.body
  if (name) item.name = name
  if (description !== undefined) item.description = description
  res.json({ item })
})

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const index = items.findIndex(i => i.id === id)
  if (index === -1) return res.status(404).json({ error: 'Item not found' })
  items.splice(index, 1)
  res.status(204).end()
})

export default router
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
interface Item {
  id: number
  name: string
  description: string
}

const router = new Router()
let items: Item[] = [
  { id: 1, name: 'Item 1', description: 'First item' },
  { id: 2, name: 'Item 2', description: 'Second item' }
]
let nextId = 3

router.get('/', (req: InvokeRequest, res: InvokeResponse) => {
  res.json({ items, count: items.length })
})

router.get('/:id', (req: InvokeRequest, res: InvokeResponse) => {
  const id = parseInt(req.params.id)
  const item = items.find(i => i.id === id)
  if (!item) return res.status(404).json({ error: 'Item not found' })
  res.json({ item })
})

router.post('/', (req: InvokeRequest, res: InvokeResponse) => {
  const { name, description } = req.body as { name: string; description?: string }
  if (!name) return res.status(400).json({ error: 'Name is required' })
  const newItem: Item = { id: nextId++, name, description: description ?? '' }
  items.push(newItem)
  res.status(201).json({ item: newItem })
})

router.delete('/:id', (req: InvokeRequest, res: InvokeResponse) => {
  const id = parseInt(req.params.id)
  const index = items.findIndex(i => i.id === id)
  if (index === -1) return res.status(404).json({ error: 'Item not found' })
  items.splice(index, 1)
  res.status(204).end()
})

export default router
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public partial class App : Router
{
    private static readonly List<JsonObject> _items = new()
    {
        new JsonObject { ["id"] = 1, ["name"] = "Item 1", ["description"] = "First item" },
        new JsonObject { ["id"] = 2, ["name"] = "Item 2", ["description"] = "Second item" }
    };
    private static int _nextId = 3;

    [HttpGet("/")]
    public Task List(InvokeRequest req, InvokeResponse res)
    {
        var arr = new JsonArray();
        foreach (var item in _items) arr.Add(item.DeepClone());
        res.Status(200).Json(new JsonObject { ["items"] = arr, ["count"] = _items.Count });
        return Task.CompletedTask;
    }

    [HttpGet("/:id")]
    public Task Get(InvokeRequest req, InvokeResponse res)
    {
        var id = int.Parse(req.Params["id"]);
        var item = _items.FirstOrDefault(i => i["id"]?.GetValue<int>() == id);
        if (item is null) { res.Status(404).Json(new JsonObject { ["error"] = "Item not found" }); return Task.CompletedTask; }
        res.Status(200).Json(item.DeepClone());
        return Task.CompletedTask;
    }

    [HttpPost("/")]
    public Task Create(InvokeRequest req, InvokeResponse res)
    {
        var name = req.Body?["name"]?.GetValue<string>();
        if (string.IsNullOrEmpty(name)) { res.Status(400).Json(new JsonObject { ["error"] = "Name is required" }); return Task.CompletedTask; }
        var newItem = new JsonObject { ["id"] = _nextId++, ["name"] = name, ["description"] = req.Body?["description"]?.GetValue<string>() ?? "" };
        _items.Add(newItem);
        res.Status(201).Json(newItem.DeepClone());
        return Task.CompletedTask;
    }

    [HttpDelete("/:id")]
    public Task Delete(InvokeRequest req, InvokeResponse res)
    {
        var id = int.Parse(req.Params["id"]);
        var removed = _items.RemoveAll(i => i["id"]?.GetValue<int>() == id) > 0;
        if (!removed) { res.Status(404).Json(new JsonObject { ["error"] = "Item not found" }); return Task.CompletedTask; }
        res.Status(204).End();
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

# File Serving Guide

Learn how to serve static file from your Invoke functions. There are built-in middlewares to support common scenarios in Bun runtime.

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Serve a static directory

Use `invoke.serve.static(...)` middleware for regular static assets.

```javascript
import path from 'path'

const publicDir = path.join(process.cwd(), 'public')

export default invoke.serve.static(publicDir, {
  maxAge: '1h',
  etag: true,
  immutable: false,
  index: ['index.html']
})
```

Since `invoke.serve.static(...)` itself is a middleware, you can also chain it with `Router`.

```javascript
import path from 'path'

const router = new Router()

const publicDir = path.join(process.cwd(), 'public')

router.get(
  '/static',
  invoke.serve.static(publicDir, {
    maxAge: '1h',
    etag: true,
    immutable: false,
    index: ['index.html']
  })
)

router.post('/api/xxx', (req, res) => {
  // Your API here
})

export default router
```

Useful options:

- `maxAge`, `immutable`, `etag` for caching behavior
- `index` for directory index files
- `dotfiles`, `extensions`, `setHeaders` for advanced behavior
- `fallthrough` if you want missing files to pass to next middleware

## Serve an SPA

Use `invoke.serve.spa(...)` middleware for history-based client routing.

```javascript
import path from 'path'

const distDir = path.join(process.cwd(), 'dist')

export default invoke.serve.spa(distDir, {
  index: '/index.html',
  rewrites: [{ from: /^\/admin/, to: '/index.html' }]
})
```

## Serve one specific file

Use `res.sendFile(...)` when you want to return a known file directly.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  res.sendFile('/var/task/public/index.html')
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  res.sendFile('/var/task/public/index.html')
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using Invoke;

[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    res.SendFile("/var/task/public/index.html");
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Force download

Use `res.download(...)` (or `res.Download(...)` in C#) to prompt a download.

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  res.download('/var/task/reports/monthly-report.pdf', 'monthly-report.pdf')
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  res.download('/var/task/reports/monthly-report.pdf', 'monthly-report.pdf')
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using Invoke;

[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    res.Download("/var/task/reports/monthly-report.pdf", "monthly-report.pdf");
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## MIME Types

`sendFile` / `SendFile` automatically sets MIME type from file extension.

## Next Steps

- [Bun Global APIs](/docs/api/bun/globals)
- [Response Object (Bun)](/docs/api/bun/response)
- [Response Object (C#)](/docs/api/dotnet/response)

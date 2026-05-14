# File Serving Guide

Learn how to serve static files from your Invoke functions.

## Basic File Serving

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import path from 'path'

export default function handler(req, res) {
  const filePath = path.join(__dirname, 'public', 'index.html')
  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import path from 'path'
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const filePath = path.join(__dirname, 'public', 'index.html')
  res.sendFile(filePath)
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

## Serving a Static Website

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import path from 'path'
import fs from 'fs'

export default function handler(req, res) {
  // Get requested path, default to index.html
  let requestPath = req.path === '/' ? 'index.html' : req.path.substring(1)

  // Security: prevent directory traversal
  if (requestPath.includes('..') || requestPath.includes('\\')) {
    return res.status(403).send('Forbidden')
  }

  // Build full file path
  const filePath = path.join(__dirname, 'public', requestPath)

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found')
  }

  // Check if it's a file (not a directory)
  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    return res.status(403).send('Forbidden')
  }

  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import path from 'path'
import fs from 'fs'
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  // Get requested path, default to index.html
  let requestPath: string = req.path === '/' ? 'index.html' : req.path.substring(1)

  // Security: prevent directory traversal
  if (requestPath.includes('..') || requestPath.includes('\\')) {
    return res.status(403).send('Forbidden')
  }

  // Build full file path
  const filePath = path.join(__dirname, 'public', requestPath)

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found')
  }

  // Check if it's a file (not a directory)
  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    return res.status(403).send('Forbidden')
  }

  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using Invoke;

[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    var publicDir = "/var/task/public";
    var requestPath = req.Path == "/" ? "index.html" : req.Path.TrimStart('/');

    // Security: prevent directory traversal
    if (requestPath.Contains("..") || requestPath.Contains('\\'))
        return res.Status(403).Send("Forbidden");

    var filePath = Path.GetFullPath(requestPath, publicDir);

    // Ensure within public directory
    if (!filePath.StartsWith(publicDir))
        return res.Status(403).Send("Forbidden");

    res.SendFile(filePath);
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Project Structure

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```
function.zip
├── index.js
├── package.json
└── public/
    ├── index.html
    ├── about.html
    ├── style.css
    ├── script.js
    └── images/
        └── logo.png
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```
function.zip
├── index.ts
├── package.json
├── tsconfig.json
└── public/
    ├── index.html
    ├── about.html
    ├── style.css
    ├── script.js
    └── images/
        └── logo.png
```

</TabItem>
<TabItem value="csharp" label="C#">

```
function.zip
├── MyFunction.dll
├── MyFunction.runtimeconfig.json
└── public/
    ├── index.html
    ├── about.html
    ├── style.css
    ├── script.js
    └── images/
        └── logo.png
```

</TabItem>
</Tabs>

## MIME Type Detection

`SendFile` / `res.sendFile()` automatically detects MIME types:

```
// index.html     → text/html
// style.css      → text/css
// script.js      → application/javascript
// image.png      → image/png
// document.pdf   → application/pdf
```

## Manual MIME Types

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import mimeTypes from 'mime-types'

export default function handler(req, res) {
  const filePath = path.join(__dirname, 'files', req.query.file)
  const mimeType = mimeTypes.lookup(filePath) || 'application/octet-stream'
  res.type(mimeType)
  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import mimeTypes from 'mime-types'
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const filePath = path.join(__dirname, 'files', req.query.file as string)
  const mimeType = mimeTypes.lookup(filePath) || 'application/octet-stream'
  res.type(mimeType)
  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// Override the auto-detected MIME type before calling SendFile
res.Type("application/octet-stream").SendFile("/var/task/files/data.bin");
```

</TabItem>
</Tabs>

## File Downloads

Force browser to download instead of display:

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const filePath = path.join(__dirname, 'reports', 'report.pdf')
  res.download(filePath, 'monthly-report.pdf')
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const filePath = path.join(__dirname, 'reports', 'report.pdf')
  res.download(filePath, 'monthly-report.pdf')
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
res.Download("/var/task/reports/report.pdf", "monthly-report.pdf");
```

</TabItem>
</Tabs>

## Streaming Large Files

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import fs from 'fs'

export default function handler(req, res) {
  const filePath = path.join(__dirname, 'large-file.mp4')

  const stat = fs.statSync(filePath)
  res.setHeader('Content-Length', stat.size)
  res.setHeader('Content-Type', 'video/mp4')

  const stream = fs.createReadStream(filePath)
  stream.pipe(res)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import fs from 'fs'
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const filePath = path.join(__dirname, 'large-file.mp4')

  const stat = fs.statSync(filePath)
  res.setHeader('Content-Length', stat.size)
  res.setHeader('Content-Type', 'video/mp4')

  const stream = fs.createReadStream(filePath)
  stream.pipe(res)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// SendFile reads the file and streams it in one call — no extra setup needed
res.SendFile("/var/task/large-file.mp4");
```

</TabItem>
</Tabs>

## Security Best Practices

### 1. Prevent Directory Traversal

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
// ❌ DANGEROUS
const filePath = path.join(__dirname, req.query.file)

// ✅ SAFE
let requestPath = req.path || '/'
if (requestPath.includes('..') || requestPath.includes('\\')) {
  return res.status(403).send('Forbidden')
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
// ❌ DANGEROUS
const filePath = path.join(__dirname, req.query.file as string)

// ✅ SAFE
let requestPath: string = req.path || '/'
if (requestPath.includes('..') || requestPath.includes('\\')) {
  return res.status(403).send('Forbidden')
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// ❌ DANGEROUS
res.SendFile("/var/task/" + req.Query["file"]);

// ✅ SAFE
var requestPath = req.Query["file"] ?? "";
if (requestPath.Contains("..") || requestPath.Contains('\\'))
    return res.Status(403).Send("Forbidden");
```

</TabItem>
</Tabs>

### 2. Whitelist Extensions

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.gif']

export default function handler(req, res) {
  const ext = path.extname(req.path).toLowerCase()

  if (!allowedExtensions.includes(ext)) {
    return res.status(403).send('File type not allowed')
  }

  // Serve file...
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.gif']

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const ext = path.extname(req.path).toLowerCase()

  if (!allowedExtensions.includes(ext)) {
    return res.status(403).send('File type not allowed')
  }

  // Serve file...
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
var allowedExtensions = new HashSet<string> { ".html", ".css", ".js", ".png", ".jpg", ".gif" };
var ext = Path.GetExtension(filePath).ToLowerInvariant();

if (!allowedExtensions.Contains(ext))
    return res.Status(403).Send("File type not allowed");
```

</TabItem>
</Tabs>

### 3. Validate File Paths

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
const publicDir = path.join(__dirname, 'public')

export default function handler(req, res) {
  const filePath = path.join(publicDir, req.path)
  const resolvedPath = path.resolve(filePath)

  // Ensure resolved path is within public directory
  if (!resolvedPath.startsWith(publicDir)) {
    return res.status(403).send('Forbidden')
  }

  res.sendFile(resolvedPath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

const publicDir = path.join(__dirname, 'public')

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const filePath = path.join(publicDir, req.path)
  const resolvedPath = path.resolve(filePath)

  // Ensure resolved path is within public directory
  if (!resolvedPath.startsWith(publicDir)) {
    return res.status(403).send('Forbidden')
  }

  res.sendFile(resolvedPath)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
var publicDir = "/var/task/public";
var resolved = Path.GetFullPath(requestPath, publicDir);

if (!resolved.StartsWith(publicDir))
    return res.Status(403).Send("Forbidden");

res.SendFile(resolved);
```

</TabItem>
</Tabs>

## Caching Headers

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
export default function handler(req, res) {
  const ext = path.extname(req.path)

  // Cache static assets for 1 year
  if (['.css', '.js', '.png', '.jpg'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000')
  }

  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const ext = path.extname(req.path)

  // Cache static assets for 1 year
  if (['.css', '.js', '.png', '.jpg'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000')
  }

  res.sendFile(filePath)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// Use SendFileOptions to set Cache-Control automatically
res.SendFile("/var/task/public/style.css", new SendFileOptions
{
    MaxAge = 31_536_000_000 // 1 year in milliseconds
});
```

</TabItem>
</Tabs>

## Complete Example

<Tabs groupId="language">
<TabItem value="js" label="JavaScript">

```javascript
import path from 'path'
import fs from 'fs'

export default function handler(req, res) {
  let requestPath = req.path === '/' ? '/index.html' : req.path
  requestPath = requestPath.substring(1)

  if (requestPath.includes('..') || requestPath.includes('\\')) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const publicDir = path.join(__dirname, 'public')
  const filePath = path.join(publicDir, requestPath)
  const resolvedPath = path.resolve(filePath)

  if (!resolvedPath.startsWith(publicDir)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).send('File not found')
  }

  const stats = fs.statSync(resolvedPath)
  if (!stats.isFile()) {
    return res.status(403).json({ error: 'Not a file' })
  }

  const ext = path.extname(resolvedPath)
  if (['.css', '.js', '.png', '.jpg', '.gif', '.svg'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600')
  }

  res.sendFile(resolvedPath)
}
```

</TabItem>
<TabItem value="ts" label="TypeScript">

```typescript
import path from 'path'
import fs from 'fs'
import { InvokeRequest, InvokeResponse } from 'invoke-bun'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  let requestPath: string = req.path === '/' ? '/index.html' : req.path
  requestPath = requestPath.substring(1)

  if (requestPath.includes('..') || requestPath.includes('\\')) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const publicDir = path.join(__dirname, 'public')
  const filePath = path.join(publicDir, requestPath)
  const resolvedPath = path.resolve(filePath)

  if (!resolvedPath.startsWith(publicDir)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).send('File not found')
  }

  const stats = fs.statSync(resolvedPath)
  if (!stats.isFile()) {
    return res.status(403).json({ error: 'Not a file' })
  }

  const ext = path.extname(resolvedPath)
  if (['.css', '.js', '.png', '.jpg', '.gif', '.svg'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600')
  }

  res.sendFile(resolvedPath)
}
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
using Invoke;
using Invoke.Core;

[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    var publicDir = "/var/task/public";
    var requestPath = req.Path == "/" ? "index.html" : req.Path.TrimStart('/');

    if (requestPath.Contains("..") || requestPath.Contains('\\'))
        return res.Status(403).Json(new { error = "Forbidden" });

    var resolved = Path.GetFullPath(requestPath, publicDir);
    if (!resolved.StartsWith(publicDir))
        return res.Status(403).Json(new { error = "Forbidden" });

    if (!File.Exists(resolved))
        return res.Status(404).Send("File not found");

    var ext = Path.GetExtension(resolved).ToLowerInvariant();
    var cacheableExts = new HashSet<string> { ".css", ".js", ".png", ".jpg", ".gif", ".svg" };
    var options = cacheableExts.Contains(ext)
        ? new SendFileOptions { MaxAge = 3_600_000 }
        : null;

    res.SendFile(resolved, options);
    return Task.CompletedTask;
}
```

</TabItem>
</Tabs>

## Next Steps

- [Response Object (Bun)](/docs/api/bun/response) - File serving methods for JavaScript/TypeScript
- [Response Object (C#)](/docs/api/dotnet/response) - File serving methods for C#

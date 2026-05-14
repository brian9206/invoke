import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Compression Guide

Learn how to compress and decompress data in your Invoke functions.

## Overview

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = 'Hello World! '.repeat(100)
  const compressed = zlib.gzipSync(data)
  const decompressed = zlib.gunzipSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = 'Hello World! '.repeat(100)
  const compressed = zlib.gzipSync(data)
  const decompressed = zlib.gunzipSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data = Encoding.UTF8.GetBytes(string.Concat(Enumerable.Repeat("Hello World! ", 100)));

        // Compress
        using var compressedStream = new MemoryStream();
        using (var gzip = new GZipStream(compressedStream, CompressionLevel.Optimal))
            gzip.Write(data, 0, data.Length);
        var compressed = compressedStream.ToArray();

        res.Status(200).Json(new JsonObject
        {
            ["original"]   = data.Length,
            ["compressed"] = compressed.Length,
            ["ratio"]      = $"{(double)compressed.Length / data.Length * 100:F2}%"
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Gzip Compression

### Synchronous

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = 'Hello World! '.repeat(100)
  const compressed = zlib.gzipSync(data)
  const decompressed = zlib.gunzipSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%',
    decompressed: decompressed.toString()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = 'Hello World! '.repeat(100)
  const compressed = zlib.gzipSync(data)
  const decompressed = zlib.gunzipSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%',
    decompressed: decompressed.toString()
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data = Encoding.UTF8.GetBytes(string.Concat(Enumerable.Repeat("Hello World! ", 100)));

        byte[] compressed;
        using (var ms = new MemoryStream())
        {
            using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
                gz.Write(data);
            compressed = ms.ToArray();
        }

        byte[] decompressed;
        using (var input = new MemoryStream(compressed))
        using (var gz = new GZipStream(input, CompressionMode.Decompress))
        using (var output = new MemoryStream())
        {
            gz.CopyTo(output);
            decompressed = output.ToArray();
        }

        res.Status(200).Json(new JsonObject
        {
            ["original"]     = data.Length,
            ["compressed"]   = compressed.Length,
            ["ratio"]        = $"{(double)compressed.Length / data.Length * 100:F2}%",
            ["decompressed"] = Encoding.UTF8.GetString(decompressed)
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Streaming

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'
import { Readable } from 'stream'

export default async function handler(req, res) {
  const chunks = []
  const source = Readable.from(['chunk 1 ', 'chunk 2 ', 'chunk 3'])
  const gzip = zlib.createGzip()

  for await (const chunk of source.pipe(gzip)) {
    chunks.push(chunk)
  }

  const compressed = Buffer.concat(chunks)
  res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Content-Type', 'text/plain')
  res.send(compressed)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'
import { Readable } from 'stream'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const chunks: Buffer[] = []
  const source = Readable.from(['chunk 1 ', 'chunk 2 ', 'chunk 3'])
  const gzip = zlib.createGzip()

  for await (const chunk of source.pipe(gzip)) {
    chunks.push(chunk as Buffer)
  }

  const compressed = Buffer.concat(chunks)
  res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Content-Type', 'text/plain')
  res.send(compressed)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var parts = new[] { "chunk 1 ", "chunk 2 ", "chunk 3" };
        var data  = Encoding.UTF8.GetBytes(string.Concat(parts));

        using var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
            gz.Write(data);

        res.SetHeader("Content-Encoding", "gzip")
           .SetHeader("Content-Type", "text/plain")
           .Send(ms.ToArray());
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Deflate Compression

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = Buffer.from(req.body.data)
  const compressed = zlib.deflateSync(data)
  const decompressed = zlib.inflateSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    decompressed: decompressed.toString()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = Buffer.from((req.body as { data: string }).data)
  const compressed = zlib.deflateSync(data)
  const decompressed = zlib.inflateSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    decompressed: decompressed.toString()
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data = Encoding.UTF8.GetBytes(req.Body?["data"]?.GetValue<string>() ?? "");

        byte[] compressed;
        using (var ms = new MemoryStream())
        {
            using (var def = new DeflateStream(ms, CompressionLevel.Optimal))
                def.Write(data);
            compressed = ms.ToArray();
        }

        byte[] decompressed;
        using (var input = new MemoryStream(compressed))
        using (var def = new DeflateStream(input, CompressionMode.Decompress))
        using (var output = new MemoryStream())
        {
            def.CopyTo(output);
            decompressed = output.ToArray();
        }

        res.Status(200).Json(new JsonObject
        {
            ["original"]     = data.Length,
            ["compressed"]   = compressed.Length,
            ["decompressed"] = Encoding.UTF8.GetString(decompressed)
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Brotli Compression

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = 'Large data...'.repeat(1000)
  const compressed = zlib.brotliCompressSync(data)
  const decompressed = zlib.brotliDecompressSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = 'Large data...'.repeat(1000)
  const compressed = zlib.brotliCompressSync(data)
  const decompressed = zlib.brotliDecompressSync(compressed)

  res.json({
    original: data.length,
    compressed: compressed.length,
    ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data = Encoding.UTF8.GetBytes(string.Concat(Enumerable.Repeat("Large data...", 1000)));

        byte[] compressed;
        using (var ms = new MemoryStream())
        {
            using (var br = new BrotliStream(ms, CompressionLevel.Optimal))
                br.Write(data);
            compressed = ms.ToArray();
        }

        byte[] decompressed;
        using (var input = new MemoryStream(compressed))
        using (var br = new BrotliStream(input, CompressionMode.Decompress))
        using (var output = new MemoryStream())
        {
            br.CopyTo(output);
            decompressed = output.ToArray();
        }

        res.Status(200).Json(new JsonObject
        {
            ["original"]   = data.Length,
            ["compressed"] = compressed.Length,
            ["ratio"]      = $"{(double)compressed.Length / data.Length * 100:F2}%"
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Compressing JSON

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default async function handler(req, res) {
  const data = {
    users: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`
    }))
  }

  const json = JSON.stringify(data)
  const compressed = zlib.gzipSync(json)

  await kv.set('users:compressed', compressed.toString('base64'))

  res.json({
    originalSize: json.length,
    compressedSize: compressed.length,
    savings: ((1 - compressed.length / json.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = {
    users: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`
    }))
  }

  const json = JSON.stringify(data)
  const compressed = zlib.gzipSync(json)

  await kv.set('users:compressed', compressed.toString('base64'))

  res.json({
    originalSize: json.length,
    compressedSize: compressed.length,
    savings: ((1 - compressed.length / json.length) * 100).toFixed(2) + '%'
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv    = new KeyValueStore();
        var users = Enumerable.Range(0, 1000)
            .Select(i => new { id = i, name = $"User {i}", email = $"user{i}@example.com" })
            .ToArray();

        var json      = JsonSerializer.Serialize(new { users });
        var jsonBytes = Encoding.UTF8.GetBytes(json);

        byte[] compressed;
        using (var ms = new MemoryStream())
        {
            using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
                gz.Write(jsonBytes);
            compressed = ms.ToArray();
        }

        await kv.Set("users:compressed", Convert.ToBase64String(compressed));

        res.Status(200).Json(new JsonObject
        {
            ["originalSize"]   = jsonBytes.Length,
            ["compressedSize"] = compressed.Length,
            ["savings"]        = $"{(1.0 - (double)compressed.Length / jsonBytes.Length) * 100:F2}%"
        });
    }
}
```

  </TabItem>
</Tabs>

## Decompressing JSON

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default async function handler(req, res) {
  const compressedBase64 = await kv.get('users:compressed')
  const compressed = Buffer.from(compressedBase64, 'base64')
  const decompressed = zlib.gunzipSync(compressed)

  res.json(JSON.parse(decompressed.toString()))
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const compressedBase64 = (await kv.get('users:compressed')) as string
  const compressed = Buffer.from(compressedBase64, 'base64')
  const decompressed = zlib.gunzipSync(compressed)

  res.json(JSON.parse(decompressed.toString()))
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv             = new KeyValueStore();
        var base64         = (await kv.Get("users:compressed"))?.ToString() ?? "";
        var compressed     = Convert.FromBase64String(base64);

        byte[] decompressed;
        using (var input  = new MemoryStream(compressed))
        using (var gz     = new GZipStream(input, CompressionMode.Decompress))
        using (var output = new MemoryStream())
        {
            await gz.CopyToAsync(output);
            decompressed = output.ToArray();
        }

        res.Type("application/json").Send(Encoding.UTF8.GetString(decompressed));
    }
}
```

  </TabItem>
</Tabs>

## HTTP Response Compression

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = { message: 'Large response data...' }
  const json = JSON.stringify(data)
  const acceptEncoding = req.get('Accept-Encoding') || ''

  if (acceptEncoding.includes('gzip')) {
    const compressed = zlib.gzipSync(json)
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Type', 'application/json')
    res.send(compressed)
  } else {
    res.json(data)
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = { message: 'Large response data...' }
  const json = JSON.stringify(data)
  const acceptEncoding = req.get('Accept-Encoding') ?? ''

  if (acceptEncoding.includes('gzip')) {
    const compressed = zlib.gzipSync(json)
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Type', 'application/json')
    res.send(compressed)
  } else {
    res.json(data)
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data           = new { message = "Large response data..." };
        var json           = JsonSerializer.Serialize(data);
        var acceptEncoding = req.GetHeader("Accept-Encoding") ?? "";

        if (acceptEncoding.Contains("gzip"))
        {
            var jsonBytes = Encoding.UTF8.GetBytes(json);
            using var ms  = new MemoryStream();
            using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
                gz.Write(jsonBytes);

            res.SetHeader("Content-Encoding", "gzip")
               .SetHeader("Content-Type", "application/json")
               .Send(ms.ToArray());
        }
        else
        {
            res.Type("application/json").Send(json);
        }
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Compression Levels

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = 'Data to compress'.repeat(100)
  const results = {}

  for (let level = 0; level <= 9; level++) {
    const compressed = zlib.gzipSync(data, { level })
    results[`level_${level}`] = {
      size: compressed.length,
      ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
    }
  }

  res.json(results)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = 'Data to compress'.repeat(100)
  const results: Record<string, { size: number; ratio: string }> = {}

  for (let level = 0; level <= 9; level++) {
    const compressed = zlib.gzipSync(data, { level })
    results[`level_${level}`] = {
      size: compressed.length,
      ratio: ((compressed.length / data.length) * 100).toFixed(2) + '%'
    }
  }

  res.json(results)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data   = Encoding.UTF8.GetBytes(string.Concat(Enumerable.Repeat("Data to compress", 100)));
        var levels = new[]
        {
            ("fastest",  CompressionLevel.Fastest),
            ("optimal",  CompressionLevel.Optimal),
            ("smallest", CompressionLevel.SmallestSize)
        };

        var results = new JsonObject();
        foreach (var (name, level) in levels)
        {
            using var ms = new MemoryStream();
            using (var gz = new GZipStream(ms, level)) gz.Write(data);
            results[name] = new JsonObject
            {
                ["size"]  = ms.Length,
                ["ratio"] = $"{(double)ms.Length / data.Length * 100:F2}%"
            };
        }

        res.Status(200).Json(results);
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Best Compression Algorithm Comparison

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  const data = req.body.data || 'Test data'.repeat(1000)
  const gzipped = zlib.gzipSync(data)
  const deflated = zlib.deflateSync(data)
  const brotli = zlib.brotliCompressSync(data)

  res.json({
    original: data.length,
    gzip: { size: gzipped.length, ratio: ((gzipped.length / data.length) * 100).toFixed(2) + '%' },
    deflate: { size: deflated.length, ratio: ((deflated.length / data.length) * 100).toFixed(2) + '%' },
    brotli: { size: brotli.length, ratio: ((brotli.length / data.length) * 100).toFixed(2) + '%' }
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = (req.body as { data?: string }).data ?? 'Test data'.repeat(1000)
  const gzipped = zlib.gzipSync(data)
  const deflated = zlib.deflateSync(data)
  const brotli = zlib.brotliCompressSync(data)

  res.json({
    original: data.length,
    gzip: { size: gzipped.length, ratio: ((gzipped.length / data.length) * 100).toFixed(2) + '%' },
    deflate: { size: deflated.length, ratio: ((deflated.length / data.length) * 100).toFixed(2) + '%' },
    brotli: { size: brotli.length, ratio: ((brotli.length / data.length) * 100).toFixed(2) + '%' }
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    private static (long size, string ratio) Compress(byte[] data, Func<Stream, Stream> factory)
    {
        using var ms = new MemoryStream();
        using (var s = factory(ms)) s.Write(data);
        return (ms.Length, $"{(double)ms.Length / data.Length * 100:F2}%");
    }

    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var input = req.Body?["data"]?.GetValue<string>()
                    ?? string.Concat(Enumerable.Repeat("Test data", 1000));
        var data  = Encoding.UTF8.GetBytes(input);

        var gz  = Compress(data, ms => new GZipStream(ms, CompressionLevel.Optimal));
        var def = Compress(data, ms => new DeflateStream(ms, CompressionLevel.Optimal));
        var br  = Compress(data, ms => new BrotliStream(ms, CompressionLevel.Optimal));

        res.Status(200).Json(new JsonObject
        {
            ["original"] = data.Length,
            ["gzip"]     = new JsonObject { ["size"] = gz.size,  ["ratio"] = gz.ratio  },
            ["deflate"]  = new JsonObject { ["size"] = def.size, ["ratio"] = def.ratio },
            ["brotli"]   = new JsonObject { ["size"] = br.size,  ["ratio"] = br.ratio  }
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Error Handling

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default function handler(req, res) {
  try {
    const compressed = Buffer.from(req.body.data, 'base64')
    const decompressed = zlib.gunzipSync(compressed)
    res.send(decompressed.toString())
  } catch (error) {
    if (error.code === 'Z_DATA_ERROR') {
      res.status(400).json({ error: 'Invalid compressed data' })
    } else {
      res.status(500).json({ error: 'Decompression failed' })
    }
  }
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  try {
    const compressed = Buffer.from((req.body as { data: string }).data, 'base64')
    const decompressed = zlib.gunzipSync(compressed)
    res.send(decompressed.toString())
  } catch (error: any) {
    if (error?.code === 'Z_DATA_ERROR') {
      res.status(400).json({ error: 'Invalid compressed data' })
    } else {
      res.status(500).json({ error: 'Decompression failed' })
    }
  }
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        try
        {
            var base64     = req.Body?["data"]?.GetValue<string>() ?? "";
            var compressed = Convert.FromBase64String(base64);

            using var input  = new MemoryStream(compressed);
            using var gz     = new GZipStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            gz.CopyTo(output);

            res.Send(Encoding.UTF8.GetString(output.ToArray()));
        }
        catch (InvalidDataException)
        {
            res.Status(400).Json(new JsonObject { ["error"] = "Invalid compressed data" });
        }
        catch (Exception ex)
        {
            res.Status(500).Json(new JsonObject { ["error"] = "Decompression failed", ["message"] = ex.Message });
        }
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Use Cases

### 1. Compressing Large KV Store Values

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default async function handler(req, res) {
  const largeData = {
    /* large object */
  }
  const compressed = zlib.gzipSync(JSON.stringify(largeData))
  await kv.set('large:data', compressed.toString('base64'))
  res.json({ stored: true })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const largeData: Record<string, unknown> = {
    /* large object */
  }
  const compressed = zlib.gzipSync(JSON.stringify(largeData))
  await kv.set('large:data', compressed.toString('base64'))
  res.json({ stored: true })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv       = new KeyValueStore();
        var data     = new { /* large object */ };
        var json     = JsonSerializer.Serialize(data);

        using var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
            gz.Write(Encoding.UTF8.GetBytes(json));

        await kv.Set("large:data", Convert.ToBase64String(ms.ToArray()));
        res.Status(200).Json(new JsonObject { ["stored"] = true });
    }
}
```

  </TabItem>
</Tabs>

### 2. API Response Caching

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import zlib from 'zlib'

export default async function handler(req, res) {
  const cacheKey = 'api:response'
  const cached = await kv.get(cacheKey)

  if (cached) {
    const decompressed = zlib.gunzipSync(Buffer.from(cached, 'base64'))
    return res.json(JSON.parse(decompressed.toString()))
  }

  const response = await fetch('https://api.example.com/large-data')
  const data = await response.json()
  const compressed = zlib.gzipSync(JSON.stringify(data))

  await kv.set(cacheKey, compressed.toString('base64'), 3600000)
  res.json(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import zlib from 'zlib'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const cacheKey = 'api:response'
  const cached = (await kv.get(cacheKey)) as string | null

  if (cached) {
    const decompressed = zlib.gunzipSync(Buffer.from(cached, 'base64'))
    return res.json(JSON.parse(decompressed.toString()))
  }

  const response = await fetch('https://api.example.com/large-data')
  const data = await response.json()
  const compressed = zlib.gzipSync(JSON.stringify(data))

  await kv.set(cacheKey, compressed.toString('base64'), 3600000)
  res.json(data)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    private static readonly HttpClient _http = new();

    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv     = new KeyValueStore();
        const string cacheKey = "api:response";
        var cached = (await kv.Get(cacheKey))?.ToString();

        if (cached != null)
        {
            using var input  = new MemoryStream(Convert.FromBase64String(cached));
            using var gz     = new GZipStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            await gz.CopyToAsync(output);
            res.Type("application/json").Send(Encoding.UTF8.GetString(output.ToArray()));
            return;
        }

        var json = await _http.GetStringAsync("https://api.example.com/large-data");

        using var compressMs = new MemoryStream();
        using (var gz = new GZipStream(compressMs, CompressionLevel.Optimal))
            gz.Write(Encoding.UTF8.GetBytes(json));

        await kv.Set(cacheKey, Convert.ToBase64String(compressMs.ToArray()), 3600000);
        res.Type("application/json").Send(json);
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

### 1. Choose Right Algorithm

- **Gzip**: Best balance, wide support
- **Deflate**: Similar to gzip, less overhead
- **Brotli**: Best compression, slightly slower

### 2. Consider Compression Level

| Level   | Bun (`zlib`) | C# (`CompressionLevel`) |
| ------- | ------------ | ----------------------- |
| Fast    | `level: 1`   | `Fastest`               |
| Default | `level: 6`   | `Optimal`               |
| Best    | `level: 9`   | `SmallestSize`          |

### 3. Only Compress Large Data

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
if (data.length > 1024) {
  compressed = zlib.gzipSync(data)
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
if (data.length > 1024) {
  compressed = zlib.gzipSync(data)
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
if (data.Length > 1024)
{
    using var ms = new MemoryStream();
    using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
        gz.Write(data);
    compressed = ms.ToArray();
}
```

  </TabItem>
</Tabs>

## Next Steps

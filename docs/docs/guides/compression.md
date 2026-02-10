# Compression Guide

Learn how to compress and decompress data using the zlib module.

## Gzip Compression

### Synchronous

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = 'Hello World! '.repeat(100);
    
    // Compress
    const compressed = zlib.gzipSync(data);
    
    // Decompress
    const decompressed = zlib.gunzipSync(compressed);
    
    res.json({
        original: data.length,
        compressed: compressed.length,
        ratio: (compressed.length / data.length * 100).toFixed(2) + '%',
        decompressed: decompressed.toString()
    });
};
```

### Streaming

```javascript
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

module.exports = function(req, res) {
    const inputPath = path.join(__dirname, 'large-file.txt');
    const outputPath = path.join(__dirname, 'large-file.txt.gz');
    
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip();
    
    input.pipe(gzip).pipe(output);
    
    output.on('finish', () => {
        res.send('File compressed');
    });
};
```

## Deflate Compression

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = Buffer.from(req.body.data);
    
    // Compress
    const compressed = zlib.deflateSync(data);
    
    // Decompress
    const decompressed = zlib.inflateSync(compressed);
    
    res.json({
        original: data.length,
        compressed: compressed.length,
        decompressed: decompressed.toString()
    });
};
```

## Brotli Compression

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = 'Large data...'.repeat(1000);
    
    // Compress with Brotli
    const compressed = zlib.brotliCompressSync(data);
    
    // Decompress
    const decompressed = zlib.brotliDecompressSync(compressed);
    
    res.json({
        original: data.length,
        compressed: compressed.length,
        ratio: (compressed.length / data.length * 100).toFixed(2) + '%'
    });
};
```

## Compressing JSON

```javascript
const zlib = require('zlib');

module.exports = async function(req, res) {
    const data = {
        users: Array(1000).fill(null).map((_, i) => ({
            id: i,
            name: `User ${i}`,
            email: `user${i}@example.com`
        }))
    };
    
    // Serialize and compress
    const json = JSON.stringify(data);
    const compressed = zlib.gzipSync(json);
    
    // Store compressed data
    await kv.set('users:compressed', compressed.toString('base64'));
    
    res.json({
        originalSize: json.length,
        compressedSize: compressed.length,
        savings: ((1 - compressed.length / json.length) * 100).toFixed(2) + '%'
    });
};
```

## Decompressing JSON

```javascript
const zlib = require('zlib');

module.exports = async function(req, res) {
    // Retrieve compressed data
    const compressedBase64 = await kv.get('users:compressed');
    const compressed = Buffer.from(compressedBase64, 'base64');
    
    // Decompress and parse
    const decompressed = zlib.gunzipSync(compressed);
    const data = JSON.parse(decompressed.toString());
    
    res.json(data);
};
```

## HTTP Response Compression

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = { message: 'Large response data...' };
    const json = JSON.stringify(data);
    
    // Check if client accepts gzip
    const acceptEncoding = req.get('Accept-Encoding') || '';
    
    if (acceptEncoding.includes('gzip')) {
        const compressed = zlib.gzipSync(json);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json');
        res.send(compressed);
    } else {
        res.json(data);
    }
};
```

## Compression Levels

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = 'Data to compress'.repeat(100);
    const results = {};
    
    // Different compression levels (0-9)
    for (let level = 0; level <= 9; level++) {
        const compressed = zlib.gzipSync(data, { level });
        results[`level_${level}`] = {
            size: compressed.length,
            ratio: (compressed.length / data.length * 100).toFixed(2) + '%'
        };
    }
    
    res.json(results);
};
```

## Best Compression Algorithm Comparison

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    const data = req.body.data || 'Test data'.repeat(1000);
    
    const gzipped = zlib.gzipSync(data);
    const deflated = zlib.deflateSync(data);
    const brotli = zlib.brotliCompressSync(data);
    
    res.json({
        original: data.length,
        gzip: {
            size: gzipped.length,
            ratio: (gzipped.length / data.length * 100).toFixed(2) + '%'
        },
        deflate: {
            size: deflated.length,
            ratio: (deflated.length / data.length * 100).toFixed(2) + '%'
        },
        brotli: {
            size: brotli.length,
            ratio: (brotli.length / data.length * 100).toFixed(2) + '%'
        }
    });
};
```

## Error Handling

```javascript
const zlib = require('zlib');

module.exports = function(req, res) {
    try {
        const compressed = Buffer.from(req.body.data, 'base64');
        const decompressed = zlib.gunzipSync(compressed);
        res.send(decompressed.toString());
    } catch (error) {
        if (error.code === 'Z_DATA_ERROR') {
            res.status(400).json({ error: 'Invalid compressed data' });
        } else {
            res.status(500).json({ error: 'Decompression failed' });
        }
    }
};
```

## Use Cases

### 1. Compressing Large KV Store Values

```javascript
const zlib = require('zlib');

module.exports = async function(req, res) {
    const largeData = { /* large object */ };
    
    // Compress before storing
    const compressed = zlib.gzipSync(JSON.stringify(largeData));
    await kv.set('large:data', compressed.toString('base64'));
    
    res.json({ stored: true });
};
```

### 2. API Response Caching

```javascript
const zlib = require('zlib');

module.exports = async function(req, res) {
    const cacheKey = 'api:response';
    
    // Check cache
    let cached = await kv.get(cacheKey);
    
    if (cached) {
        // Decompress and return
        const decompressed = zlib.gunzipSync(Buffer.from(cached, 'base64'));
        return res.json(JSON.parse(decompressed.toString()));
    }
    
    // Fetch from API
    const response = await fetch('https://api.example.com/large-data');
    const data = await response.json();
    
    // Compress and cache
    const compressed = zlib.gzipSync(JSON.stringify(data));
    await kv.set(cacheKey, compressed.toString('base64'), 3600000);
    
    res.json(data);
};
```

## Best Practices

### 1. Choose Right Algorithm
- **Gzip**: Best balance, wide support
- **Deflate**: Similar to gzip, less overhead
- **Brotli**: Best compression, slower

### 2. Consider Compression Level
- Level 1-3: Fast, lower compression
- Level 6 (default): Balanced
- Level 9: Slowest, best compression

### 3. Compress Large Data Only
```javascript
// Only compress if data > 1KB
if (data.length > 1024) {
    compressed = zlib.gzipSync(data);
}
```

## Next Steps

- [Zlib Module](/docs/api/modules/zlib) - Complete API reference
- [Stream Module](/docs/api/modules/stream) - Stream compression
- [Buffer Module](/docs/api/modules/buffer) - Binary data handling

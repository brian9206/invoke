# zlib

The `zlib` module provides compression and decompression functionality using Gzip, Deflate, and Brotli algorithms. It's useful for compressing data before storage or transmission.

## Import

```javascript
const zlib = require('zlib');
```

## API Reference

### Compression Methods

#### zlib.gzip(buffer[, options], callback)
#### zlib.gzipSync(buffer[, options])

Compress data using gzip.

#### zlib.deflate(buffer[, options], callback)
#### zlib.deflateSync(buffer[, options])

Compress data using deflate.

#### zlib.brotliCompress(buffer[, options], callback)
#### zlib.brotliCompressSync(buffer[, options])

Compress data using Brotli (higher compression).

### Decompression Methods

#### zlib.gunzip(buffer[, options], callback)
#### zlib.gunzipSync(buffer[, options])

Decompress gzip data.

#### zlib.inflate(buffer[, options], callback)
#### zlib.inflateSync(buffer[, options])

Decompress deflate data.

#### zlib.brotliDecompress(buffer[, options], callback)
#### zlib.brotliDecompressSync(buffer[, options])

Decompress Brotli data.

### Stream Methods

#### zlib.createGzip([options])
#### zlib.createGunzip([options])
#### zlib.createDeflate([options])
#### zlib.createInflate([options])
#### zlib.createBrotliCompress([options])
#### zlib.createBrotliDecompress([options])

Create transform streams for compression/decompression.

### Options

- `level` - Compression level (0-9, default: -1 for default)
- `strategy` - Compression strategy
- `chunkSize` - Size of internal buffer chunks

## Examples

### Basic Gzip Compression

```javascript
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export async function handler(event) {
  const originalData = event.data || 'Hello, World! '.repeat(100);
  const originalBuffer = Buffer.from(originalData, 'utf8');
  
  // Compress
  const compressed = await gzipAsync(originalBuffer);
  
  // Decompress
  const decompressed = await gunzipAsync(compressed);
  const decompressedData = decompressed.toString('utf8');
  
  return {
    originalSize: originalBuffer.length,
    compressedSize: compressed.length,
    compressionRatio: ((1 - compressed.length / originalBuffer.length) * 100).toFixed(2) + '%',
    decompressedMatches: originalData === decompressedData
  };
}
```

### Synchronous Compression

```javascript
const zlib = require('zlib');

export async function handler(event) {
  const data = 'Lorem ipsum dolor sit amet. '.repeat(50);
  const buffer = Buffer.from(data, 'utf8');
  
  // Gzip
  const gzipped = zlib.gzipSync(buffer);
  const ungzipped = zlib.gunzipSync(gzipped);
  
  // Deflate
  const deflated = zlib.deflateSync(buffer);
  const inflated = zlib.inflateSync(deflated);
  
  // Brotli
  const brotlied = zlib.brotliCompressSync(buffer);
  const unbrotlied = zlib.brotliDecompressSync(brotlied);
  
  return {
    original: buffer.length,
    gzip: {
      compressed: gzipped.length,
      ratio: ((1 - gzipped.length / buffer.length) * 100).toFixed(2) + '%'
    },
    deflate: {
      compressed: deflated.length,
      ratio: ((1 - deflated.length / buffer.length) * 100).toFixed(2) + '%'
    },
    brotli: {
      compressed: brotlied.length,
      ratio: ((1 - brotlied.length / buffer.length) * 100).toFixed(2) + '%'
    }
  };
}
```

### Compressing Files

```javascript
const zlib = require('zlib');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

export async function handler(event) {
  const inputFile = '/tmp/document.txt';
  const outputFile = '/tmp/document.txt.gz';
  
  // Create test file
  const content = 'This is a test file with repeated content. '.repeat(1000);
  await fs.promises.writeFile(inputFile, content);
  
  // Compress file
  await pipelineAsync(
    fs.createReadStream(inputFile),
    zlib.createGzip(),
    fs.createWriteStream(outputFile)
  );
  
  // Get file sizes
  const originalSize = (await fs.promises.stat(inputFile)).size;
  const compressedSize = (await fs.promises.stat(outputFile)).size;
  
  return {
    inputFile,
    outputFile,
    originalSize,
    compressedSize,
    compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(2) + '%'
  };
}
```

### Decompressing Files

```javascript
const zlib = require('zlib');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

export async function handler(event) {
  const compressedFile = '/tmp/data.gz';
  const decompressedFile = '/tmp/data.txt';
  
  // Create and compress test data
  const originalData = 'Test data to compress\n'.repeat(500);
  const compressed = zlib.gzipSync(Buffer.from(originalData));
  await fs.promises.writeFile(compressedFile, compressed);
  
  // Decompress file
  await pipelineAsync(
    fs.createReadStream(compressedFile),
    zlib.createGunzip(),
    fs.createWriteStream(decompressedFile)
  );
  
  // Verify
  const decompressed = await fs.promises.readFile(decompressedFile, 'utf8');
  
  return {
    compressedSize: compressed.length,
    decompressedSize: decompressed.length,
    dataMatches: originalData === decompressed
  };
}
```

### Compression Levels

```javascript
const zlib = require('zlib');

export async function handler(event) {
  const data = 'Sample text for compression testing. '.repeat(100);
  const buffer = Buffer.from(data, 'utf8');
  
  const results = [];
  
  // Test different compression levels (0-9)
  for (let level = 0; level <= 9; level++) {
    const compressed = zlib.gzipSync(buffer, { level });
    results.push({
      level,
      originalSize: buffer.length,
      compressedSize: compressed.length,
      ratio: ((1 - compressed.length / buffer.length) * 100).toFixed(2) + '%'
    });
  }
  
  return { results };
}
```

### Streaming Compression

```javascript
const zlib = require('zlib');
const { Readable, Writable } = require('stream');

export async function handler(event) {
  const chunks = [];
  
  // Create readable stream with data
  const input = new Readable({
    read() {
      for (let i = 0; i < 10; i++) {
        this.push(`Data chunk ${i}\n`);
      }
      this.push(null); // End stream
    }
  });
  
  // Create writable stream to collect compressed data
  const output = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  
  // Pipe through gzip
  await new Promise((resolve, reject) => {
    input
      .pipe(zlib.createGzip())
      .pipe(output)
      .on('finish', resolve)
      .on('error', reject);
  });
  
  const compressed = Buffer.concat(chunks);
  
  // Decompress
  const decompressed = zlib.gunzipSync(compressed).toString('utf8');
  
  return {
    compressedSize: compressed.length,
    decompressedSize: decompressed.length,
    preview: decompressed.substring(0, 100)
  };
}
```

### Compressing JSON Data

```javascript
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export async function handler(event) {
  // Large JSON object
  const data = {
    users: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      address: {
        street: `${i + 1} Main St`,
        city: 'New York',
        country: 'USA'
      }
    })),
    timestamp: new Date().toISOString()
  };
  
  // Serialize to JSON
  const jsonString = JSON.stringify(data);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  
  // Compress
  const compressed = await gzipAsync(jsonBuffer);
  
  // Decompress
  const decompressed = await gunzipAsync(compressed);
  const parsedData = JSON.parse(decompressed.toString('utf8'));
  
  return {
    originalSize: jsonBuffer.length,
    compressedSize: compressed.length,
    compressionRatio: ((1 - compressed.length / jsonBuffer.length) * 100).toFixed(2) + '%',
    userCount: parsedData.users.length,
    dataMatches: JSON.stringify(data) === JSON.stringify(parsedData)
  };
}
```

### Brotli Compression (Better Compression Ratio)

```javascript
const zlib = require('zlib');
const { promisify } = require('util');

const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

export async function handler(event) {
  const data = 'Brotli offers better compression than gzip. '.repeat(100);
  const buffer = Buffer.from(data, 'utf8');
  
  // Compress with Brotli
  const compressed = await brotliCompressAsync(buffer);
  
  // Compare with Gzip
  const gzipCompressed = zlib.gzipSync(buffer);
  
  // Decompress
  const decompressed = await brotliDecompressAsync(compressed);
  
  return {
    originalSize: buffer.length,
    brotliSize: compressed.length,
    gzipSize: gzipCompressed.length,
    brotliBetter: compressed.length < gzipCompressed.length,
    brotliRatio: ((1 - compressed.length / buffer.length) * 100).toFixed(2) + '%',
    gzipRatio: ((1 - gzipCompressed.length / buffer.length) * 100).toFixed(2) + '%',
    decompressedMatches: data === decompressed.toString('utf8')
  };
}
```

### Compressing HTTP Responses

```javascript
const zlib = require('zlib');

export async function handler(event) {
  const responseData = {
    message: 'This is a large response',
    data: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: `Item ${i}`
    }))
  };
  
  const jsonString = JSON.stringify(responseData);
  const buffer = Buffer.from(jsonString, 'utf8');
  
  // Compress response
  const compressed = zlib.gzipSync(buffer);
  
  // Encode as base64 for transmission
  const base64Compressed = compressed.toString('base64');
  
  return {
    originalSize: buffer.length,
    compressedSize: compressed.length,
    base64Size: base64Compressed.length,
    compressionRatio: ((1 - compressed.length / buffer.length) * 100).toFixed(2) + '%',
    headers: {
      'Content-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'Content-Length': compressed.length
    }
  };
}
```

### Handling Compression Errors

```javascript
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

export async function handler(event) {
  // Try to decompress invalid data
  const invalidData = Buffer.from('This is not compressed data');
  
  try {
    const decompressed = await gunzipAsync(invalidData);
    return {
      success: true,
      data: decompressed.toString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}
```

### Chunked Compression

```javascript
const zlib = require('zlib');

export async function handler(event) {
  const gzip = zlib.createGzip();
  const chunks = [];
  
  // Collect output
  gzip.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  // Wait for completion
  const result = new Promise((resolve) => {
    gzip.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
  
  // Write data in chunks
  gzip.write('First chunk of data\n');
  gzip.write('Second chunk of data\n');
  gzip.write('Third chunk of data\n');
  gzip.end();
  
  const compressed = await result;
  const decompressed = zlib.gunzipSync(compressed).toString('utf8');
  
  return {
    compressedSize: compressed.length,
    decompressed
  };
}
```

### In-Memory Compression for Storage

```javascript
const zlib = require('zlib');

export async function handler(event) {
  // Simulate storing compressed data
  const data = {
    userId: event.userId,
    logs: Array.from({ length: 500 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      action: `Action ${i}`,
      details: 'Some details about the action'
    }))
  };
  
  const jsonString = JSON.stringify(data);
  const compressed = zlib.gzipSync(Buffer.from(jsonString));
  
  // Store compressed data (simulated)
  const storedData = compressed.toString('base64');
  
  // Later, retrieve and decompress
  const retrieved = Buffer.from(storedData, 'base64');
  const decompressed = zlib.gunzipSync(retrieved);
  const parsed = JSON.parse(decompressed.toString('utf8'));
  
  return {
    originalSize: jsonString.length,
    compressedSize: compressed.length,
    storedSize: storedData.length,
    savings: ((1 - compressed.length / jsonString.length) * 100).toFixed(2) + '%',
    logsCount: parsed.logs.length
  };
}
```

## Best Practices

- **Use async methods** - Avoid blocking the event loop with sync methods
- **Choose the right algorithm** - Brotli for best compression, Gzip for speed/compatibility
- **Set appropriate compression levels** - Higher levels = better compression but slower
- **Use streams for large data** - More memory efficient than buffering
- **Handle errors** - Compression can fail with invalid data
- **Consider bandwidth vs CPU** - Higher compression uses more CPU time
- **Cache compressed responses** - Don't recompress the same data repeatedly

## Compression Algorithm Comparison

### Gzip
- **Speed:** Fast
- **Compression:** Good
- **Support:** Universal
- **Use case:** General purpose, HTTP responses

### Deflate
- **Speed:** Fast
- **Compression:** Good (similar to Gzip)
- **Support:** Universal
- **Use case:** Alternative to Gzip

### Brotli
- **Speed:** Slower
- **Compression:** Excellent
- **Support:** Modern browsers
- **Use case:** Static content, maximum compression

## Next Steps

- [File system operations](./fs.md)
- [Stream processing](./stream.md)
- [Buffer operations](./buffer.md)
- [HTTP compression](./http.md)

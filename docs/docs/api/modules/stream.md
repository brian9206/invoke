# stream

The `stream` module provides an abstract interface for working with streaming data. Many modules in Node.js implement the stream interface for reading and writing data efficiently.

## Import

```javascript
const { Readable, Writable, Transform, pipeline, finished } = require('stream');
// or
const stream = require('stream');
```

## API Reference

### Class: stream.Readable

A stream from which data can be read.

#### readable.read([size])

Reads data from the stream.

#### readable.pipe(destination[, options])

Pipes data from the readable stream to a writable stream.

#### readable.unpipe([destination])

Removes a previously established pipe.

#### readable.pause()

Pauses the stream from emitting `'data'` events.

#### readable.resume()

Resumes a paused stream.

#### readable.on('data', callback)

Event emitted when data is available to read.

#### readable.on('end', callback)

Event emitted when there is no more data to read.

#### readable.on('error', callback)

Event emitted when an error occurs.

### Class: stream.Writable

A stream to which data can be written.

#### writable.write(chunk[, encoding][, callback])

Writes data to the stream.

#### writable.end([chunk][, encoding][, callback])

Signals that no more data will be written to the stream.

#### writable.on('finish', callback)

Event emitted when all data has been flushed.

#### writable.on('error', callback)

Event emitted when an error occurs.

### Class: stream.Transform

A duplex stream where the output is computed from the input.

### Class: stream.Duplex

A stream that is both readable and writable.

### stream.pipeline(...streams, callback)

Pipes between streams forwarding errors and properly cleaning up, calling the callback when the pipeline is complete.

### stream.finished(stream, callback)

Notifies when a stream is no longer readable, writable, or has experienced an error or premature close event.

### stream.Readable.from(iterable[, options])

Creates a readable stream from an iterable object.

## Examples

### Creating a Readable Stream

```javascript
const { Readable } = require('stream');

export async function handler(event) {
  // Create a readable stream from array
  const data = ['Hello', ' ', 'World', '!'];
  let index = 0;
  
  const readable = new Readable({
    read() {
      if (index < data.length) {
        this.push(data[index++]);
      } else {
        this.push(null); // Signal end of stream
      }
    }
  });
  
  // Collect data from stream
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk.toString());
  }
  
  return {
    result: chunks.join('')
  };
}
```

### Creating a Writable Stream

```javascript
const { Writable } = require('stream');

export async function handler(event) {
  const chunks = [];
  
  // Create a writable stream that collects data
  const writable = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    }
  });
  
  // Write data to stream
  writable.write('Hello ');
  writable.write('World');
  writable.end('!');
  
  // Wait for finish
  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
  });
  
  return {
    collected: chunks.join('')
  };
}
```

### Transform Stream

```javascript
const { Transform } = require('stream');

export async function handler(event) {
  // Create a transform stream that uppercases text
  const upperCaseTransform = new Transform({
    transform(chunk, encoding, callback) {
      this.push(chunk.toString().toUpperCase());
      callback();
    }
  });
  
  // Pipe data through transform
  const input = ['hello', ' ', 'world'];
  const output = [];
  
  upperCaseTransform.on('data', (chunk) => {
    output.push(chunk.toString());
  });
  
  for (const text of input) {
    upperCaseTransform.write(text);
  }
  upperCaseTransform.end();
  
  await new Promise(resolve => upperCaseTransform.on('end', resolve));
  
  return {
    original: input.join(''),
    transformed: output.join('')
  };
}
```

### Using pipeline()

```javascript
const { pipeline, Transform } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

export async function handler(event) {
  const { Readable, Writable } = require('stream');
  
  // Source stream
  const source = Readable.from(['Hello', ' ', 'World', '!']);
  
  // Transform stream (uppercase)
  const uppercase = new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk.toString().toUpperCase());
    }
  });
  
  // Destination stream
  const chunks = [];
  const destination = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    }
  });
  
  // Pipeline handles errors and cleanup
  await pipelineAsync(source, uppercase, destination);
  
  return {
    result: chunks.join('')
  };
}
```

### Reading Streams with for await

```javascript
const { Readable } = require('stream');

export async function handler(event) {
  // Create readable stream
  const data = ['Line 1\n', 'Line 2\n', 'Line 3\n'];
  const stream = Readable.from(data);
  
  const lines = [];
  
  // Use async iteration
  for await (const chunk of stream) {
    lines.push(chunk.toString().trim());
  }
  
  return {
    lineCount: lines.length,
    lines
  };
}
```

### Stream from File

```javascript
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

export async function handler(event) {
  const sourceFile = '/tmp/input.txt';
  const destFile = '/tmp/output.txt';
  
  // Write test data
  await fs.promises.writeFile(sourceFile, 'Hello, World!\n'.repeat(100));
  
  // Stream copy
  await pipelineAsync(
    fs.createReadStream(sourceFile),
    fs.createWriteStream(destFile)
  );
  
  const stats = await fs.promises.stat(destFile);
  
  return {
    success: true,
    bytesCoped: stats.size
  };
}
```

### JSON Transform Stream

```javascript
const { Transform } = require('stream');

class JSONLineTransform extends Transform {
  constructor(options) {
    super(options);
  }
  
  _transform(chunk, encoding, callback) {
    try {
      const obj = JSON.parse(chunk.toString());
      // Transform: add timestamp
      obj.processedAt = new Date().toISOString();
      this.push(JSON.stringify(obj) + '\n');
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

export async function handler(event) {
  const { Readable, Writable } = require('stream');
  
  const input = [
    JSON.stringify({ id: 1, name: 'Alice' }),
    JSON.stringify({ id: 2, name: 'Bob' })
  ];
  
  const source = Readable.from(input);
  const transform = new JSONLineTransform();
  
  const results = [];
  const destination = new Writable({
    write(chunk, encoding, callback) {
      results.push(JSON.parse(chunk.toString()));
      callback();
    }
  });
  
  await new Promise((resolve, reject) => {
    source.pipe(transform).pipe(destination)
      .on('finish', resolve)
      .on('error', reject);
  });
  
  return { results };
}
```

### Backpressure Handling

```javascript
const { Readable, Writable } = require('stream');

export async function handler(event) {
  let writeCount = 0;
  let drainCount = 0;
  
  // Slow writable stream (simulates backpressure)
  const slowWriter = new Writable({
    highWaterMark: 2, // Small buffer
    write(chunk, encoding, callback) {
      writeCount++;
      // Simulate slow write
      setTimeout(callback, 10);
    }
  });
  
  slowWriter.on('drain', () => {
    drainCount++;
    console.log('Drain event - ready for more data');
  });
  
  // Write data
  for (let i = 0; i < 10; i++) {
    const canWrite = slowWriter.write(`Data ${i}\n`);
    if (!canWrite) {
      // Wait for drain event
      await new Promise(resolve => slowWriter.once('drain', resolve));
    }
  }
  
  slowWriter.end();
  
  await new Promise(resolve => slowWriter.on('finish', resolve));
  
  return {
    writeCount,
    drainCount,
    message: 'Backpressure handled correctly'
  };
}
```

### Stream Events

```javascript
const { Readable } = require('stream');

export async function handler(event) {
  const events = [];
  
  const stream = new Readable({
    read() {
      // Push some data
      for (let i = 1; i <= 3; i++) {
        this.push(`Chunk ${i}\n`);
      }
      this.push(null); // End stream
    }
  });
  
  // Listen to all events
  stream.on('readable', () => {
    events.push('readable');
  });
  
  stream.on('data', (chunk) => {
    events.push(`data: ${chunk.length} bytes`);
  });
  
  stream.on('end', () => {
    events.push('end');
  });
  
  stream.on('close', () => {
    events.push('close');
  });
  
  // Consume stream
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }
  
  return {
    data: chunks.join(''),
    events
  };
}
```

### CSV Processing Stream

```javascript
const { Transform } = require('stream');

class CSVParser extends Transform {
  constructor(options) {
    super({ objectMode: true, ...options });
    this.headers = null;
  }
  
  _transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const values = line.split(',').map(v => v.trim());
      
      if (!this.headers) {
        this.headers = values;
      } else {
        const obj = {};
        this.headers.forEach((header, index) => {
          obj[header] = values[index];
        });
        this.push(obj);
      }
    }
    
    callback();
  }
}

export async function handler(event) {
  const { Readable } = require('stream');
  
  const csvData = `name,age,city
Alice,30,New York
Bob,25,Los Angeles
Carol,35,Chicago`;
  
  const source = Readable.from([csvData]);
  const parser = new CSVParser();
  
  const results = [];
  for await (const record of source.pipe(parser)) {
    results.push(record);
  }
  
  return { records: results };
}
```

### Stream Compression

```javascript
const { pipeline } = require('stream');
const { promisify } = require('util');
const zlib = require('zlib');
const fs = require('fs');

const pipelineAsync = promisify(pipeline);

export async function handler(event) {
  const inputFile = '/tmp/data.txt';
  const outputFile = '/tmp/data.txt.gz';
  
  // Create test data
  const data = 'Hello, World!\n'.repeat(1000);
  await fs.promises.writeFile(inputFile, data);
  
  // Compress using stream pipeline
  await pipelineAsync(
    fs.createReadStream(inputFile),
    zlib.createGzip(),
    fs.createWriteStream(outputFile)
  );
  
  const originalSize = (await fs.promises.stat(inputFile)).size;
  const compressedSize = (await fs.promises.stat(outputFile)).size;
  
  return {
    originalSize,
    compressedSize,
    compressionRatio: (compressedSize / originalSize * 100).toFixed(2) + '%'
  };
}
```

## Best Practices

- Always handle errors on streams
- Use `pipeline()` for automatic error handling and cleanup
- Be mindful of backpressure when writing to streams
- Use object mode for non-binary data transformations
- Prefer `for await...of` for consuming readable streams
- Clean up streams properly to avoid memory leaks

## Next Steps

- [File system operations](./fs.md)
- [Buffer operations](./buffer.md)
- [Zlib compression](./zlib.md)
- [String decoder](./string_decoder.md)

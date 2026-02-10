# string_decoder

The `string_decoder` module provides an API for decoding Buffer objects into strings while preserving encoded multi-byte UTF-8 and UTF-16 characters. It's particularly useful when working with streams.

## Import

```javascript
const { StringDecoder } = require('string_decoder');
```

## API Reference

### Class: StringDecoder

#### new StringDecoder([encoding])

Creates a new StringDecoder instance.

**Parameters:**
- `encoding` - The character encoding to use (default: `'utf8'`)

**Supported encodings:**
- `'utf8'` / `'utf-8'`
- `'utf16le'` / `'utf-16le'`
- `'latin1'`
- `'base64'`
- `'ascii'`
- `'hex'`

#### decoder.write(buffer)

Returns a decoded string, ensuring that any incomplete multibyte characters at the end of the Buffer are omitted and stored in an internal buffer for the next call.

**Parameters:**
- `buffer` - The Buffer to decode

**Returns:** Decoded string

#### decoder.end([buffer])

Returns any remaining input stored in the internal buffer as a string. If buffer is provided, it performs one final call to `write()` before returning.

**Parameters:**
- `buffer` (optional) - Final Buffer to decode

**Returns:** Decoded string

## Examples

### Basic String Decoding

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  
  // Decode buffer
  const buffer = Buffer.from('Hello, World!', 'utf8');
  const str = decoder.write(buffer);
  
  // End decoding
  const remaining = decoder.end();
  
  return {
    decoded: str,
    remaining: remaining || '(none)'
  };
}
```

### Handling Multi-Byte Characters

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  
  // UTF-8 string with multi-byte characters
  const text = '你好世界'; // "Hello World" in Chinese
  const buffer = Buffer.from(text, 'utf8');
  
  // Split buffer in the middle of a multi-byte character
  const part1 = buffer.slice(0, 3);
  const part2 = buffer.slice(3);
  
  // Decode parts - StringDecoder handles incomplete characters
  const str1 = decoder.write(part1);
  const str2 = decoder.write(part2);
  const remaining = decoder.end();
  
  return {
    original: text,
    part1Length: part1.length,
    part2Length: part2.length,
    decoded: str1 + str2 + remaining,
    isCorrect: (str1 + str2 + remaining) === text
  };
}
```

### Stream Processing with StringDecoder

```javascript
const { StringDecoder } = require('string_decoder');
const { Readable } = require('stream');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  
  // Create a readable stream with multi-byte characters
  const text = 'Hello 世界 🌍';
  const buffer = Buffer.from(text, 'utf8');
  
  // Split into chunks
  const chunks = [];
  const chunkSize = 3;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.slice(i, i + chunkSize));
  }
  
  // Decode chunks
  const decoded = chunks.map(chunk => decoder.write(chunk)).join('');
  const final = decoded + decoder.end();
  
  return {
    original: text,
    chunks: chunks.length,
    decoded: final,
    isCorrect: final === text
  };
}
```

### Comparing with Buffer.toString()

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const text = 'Hello 世界!';
  const buffer = Buffer.from(text, 'utf8');
  
  // Split in middle of multi-byte character
  const chunk1 = buffer.slice(0, 8);
  const chunk2 = buffer.slice(8);
  
  // Using Buffer.toString() - may produce incorrect output
  const bufferMethod = chunk1.toString('utf8') + chunk2.toString('utf8');
  
  // Using StringDecoder - handles incomplete characters
  const decoder = new StringDecoder('utf8');
  const decoderMethod = decoder.write(chunk1) + decoder.write(chunk2) + decoder.end();
  
  return {
    original: text,
    usingBufferToString: bufferMethod,
    usingStringDecoder: decoderMethod,
    bufferMethodCorrect: bufferMethod === text,
    decoderMethodCorrect: decoderMethod === text
  };
}
```

### Different Encodings

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const text = 'Hello, World!';
  
  // UTF-8
  const utf8Decoder = new StringDecoder('utf8');
  const utf8Buffer = Buffer.from(text, 'utf8');
  const utf8Result = utf8Decoder.write(utf8Buffer) + utf8Decoder.end();
  
  // Base64
  const base64Decoder = new StringDecoder('base64');
  const base64Buffer = Buffer.from(text, 'utf8');
  const base64Encoded = base64Buffer.toString('base64');
  const base64Result = base64Decoder.write(Buffer.from(base64Encoded, 'utf8')) + base64Decoder.end();
  
  // Hex
  const hexDecoder = new StringDecoder('hex');
  const hexEncoded = utf8Buffer.toString('hex');
  const hexResult = hexDecoder.write(Buffer.from(hexEncoded, 'utf8')) + hexDecoder.end();
  
  return {
    original: text,
    utf8: utf8Result,
    base64: base64Result,
    hex: hexResult
  };
}
```

### Processing Streaming Data

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  const results = [];
  
  // Simulate receiving data in chunks
  const data = 'Streaming data with émojis 🎉 and unicode ★';
  const buffer = Buffer.from(data, 'utf8');
  
  let offset = 0;
  const chunkSize = 5;
  
  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    const decoded = decoder.write(chunk);
    
    if (decoded) {
      results.push({
        offset,
        chunkSize: chunk.length,
        decoded
      });
    }
    
    offset += chunkSize;
  }
  
  // Get any remaining bytes
  const final = decoder.end();
  if (final) {
    results.push({
      offset: 'final',
      decoded: final
    });
  }
  
  const fullDecoded = results.map(r => r.decoded).join('');
  
  return {
    original: data,
    chunks: results.length,
    decoded: fullDecoded,
    isCorrect: fullDecoded === data,
    details: results
  };
}
```

### Handling Incomplete Sequences

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  
  // Create buffer with emoji (4-byte UTF-8 sequence)
  const emoji = '🎉';
  const buffer = Buffer.from(emoji, 'utf8');
  
  console.log('Emoji buffer length:', buffer.length); // 4 bytes
  
  // Send incomplete sequences
  const results = [];
  
  // First byte only
  results.push({
    input: 'First byte',
    output: decoder.write(buffer.slice(0, 1))
  });
  
  // Second byte
  results.push({
    input: 'Second byte',
    output: decoder.write(buffer.slice(1, 2))
  });
  
  // Third byte
  results.push({
    input: 'Third byte',
    output: decoder.write(buffer.slice(2, 3))
  });
  
  // Fourth byte - now complete
  results.push({
    input: 'Fourth byte',
    output: decoder.write(buffer.slice(3, 4))
  });
  
  const final = decoder.end();
  
  return {
    emoji,
    results,
    final,
    reconstructed: results.map(r => r.output).join('') + final
  };
}
```

### Line-by-Line Processing

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const decoder = new StringDecoder('utf8');
  let remainder = '';
  const lines = [];
  
  // Simulate receiving data in chunks
  const data = 'Line 1\nLine 2 with émoji 🎨\nLine 3\nIncomplete line';
  const buffer = Buffer.from(data, 'utf8');
  
  // Process in small chunks
  let offset = 0;
  const chunkSize = 10;
  
  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    const decoded = remainder + decoder.write(chunk);
    
    // Split by newlines
    const parts = decoded.split('\n');
    
    // All but last part are complete lines
    for (let i = 0; i < parts.length - 1; i++) {
      lines.push(parts[i]);
    }
    
    // Last part might be incomplete
    remainder = parts[parts.length - 1];
    
    offset += chunkSize;
  }
  
  // Add final data
  remainder += decoder.end();
  if (remainder) {
    lines.push(remainder);
  }
  
  return {
    totalLines: lines.length,
    lines
  };
}
```

### UTF-16 Decoding

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  const text = 'Hello, UTF-16! 你好';
  
  // Encode as UTF-16LE
  const buffer = Buffer.from(text, 'utf16le');
  
  // Decode with StringDecoder
  const decoder = new StringDecoder('utf16le');
  
  // Process in chunks
  const chunk1 = buffer.slice(0, 10);
  const chunk2 = buffer.slice(10);
  
  const decoded = decoder.write(chunk1) + decoder.write(chunk2) + decoder.end();
  
  return {
    original: text,
    bufferLength: buffer.length,
    decoded,
    isCorrect: decoded === text
  };
}
```

### Real-World: HTTP Response Processing

```javascript
const { StringDecoder } = require('string_decoder');

export async function handler(event) {
  // Simulate HTTP response chunks
  const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nHello, 世界! 🌍';
  const buffer = Buffer.from(response, 'utf8');
  
  const decoder = new StringDecoder('utf8');
  const chunks = [];
  
  // Simulate network packets (variable size)
  const sizes = [15, 20, 10, 25, buffer.length];
  let offset = 0;
  
  for (const size of sizes) {
    if (offset >= buffer.length) break;
    
    const chunk = buffer.slice(offset, Math.min(offset + size, buffer.length));
    const decoded = decoder.write(chunk);
    
    if (decoded) {
      chunks.push(decoded);
    }
    
    offset += size;
  }
  
  chunks.push(decoder.end());
  
  const fullResponse = chunks.join('');
  
  return {
    chunks: chunks.length,
    response: fullResponse,
    isComplete: fullResponse === response
  };
}
```

## When to Use StringDecoder

Use `StringDecoder` when:
- Processing streaming data with potentially incomplete multi-byte characters
- Building custom stream transformations
- Handling buffers that may split in the middle of multi-byte sequences
- You need proper UTF-8/UTF-16 boundary handling

Use `Buffer.toString()` when:
- You have complete buffers
- You're not processing streaming data
- Simpler, one-shot conversions

## Best Practices

- Always call `decoder.end()` when finished to get remaining buffered data
- Reuse the same decoder instance for a stream of related data
- Use appropriate encoding for your data source
- StringDecoder is specifically designed for text streams
- For binary data, work directly with Buffers

## Next Steps

- [Buffer operations](./buffer.md)
- [Stream processing](./stream.md)
- [File system and encoding](./fs.md)

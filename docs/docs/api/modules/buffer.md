# buffer

The `buffer` module provides a way to work with binary data directly. The `Buffer` class is a subclass of `Uint8Array` and is used to handle binary data streams.

## Import

```javascript
const { Buffer } = require('buffer');
// Buffer is also available globally
```

## API Reference

### Buffer.from(array)
### Buffer.from(arrayBuffer[, byteOffset[, length]])
### Buffer.from(buffer)
### Buffer.from(string[, encoding])

Creates a new Buffer from various sources.

**Parameters:**
- `array` - Array of bytes
- `arrayBuffer` - An ArrayBuffer
- `buffer` - A Buffer to copy from
- `string` - A string to encode
- `encoding` - Character encoding (default: 'utf8')

**Supported encodings:** `'utf8'`, `'utf-8'`, `'base64'`, `'hex'`, `'ascii'`, `'binary'`, `'latin1'`

### Buffer.alloc(size[, fill[, encoding]])

Allocates a new Buffer of `size` bytes, optionally filled with `fill`.

**Parameters:**
- `size` - Size in bytes
- `fill` (optional) - Value to fill the buffer with (default: 0)
- `encoding` (optional) - Encoding if `fill` is a string

### Buffer.allocUnsafe(size)

Allocates a new Buffer of `size` bytes without initializing memory. Faster but may contain old data.

### Buffer.concat(list[, totalLength])

Concatenates a list of Buffer instances into a single Buffer.

**Parameters:**
- `list` - Array of Buffer instances
- `totalLength` (optional) - Total length of concatenated buffers

### Buffer.isBuffer(obj)

Returns `true` if `obj` is a Buffer.

### buf.toString([encoding[, start[, end]]])

Decodes buffer to a string according to the specified encoding.

### buf.slice([start[, end]])

Returns a new Buffer that references the same memory as the original.

### buf.write(string[, offset[, length]][, encoding])

Writes `string` to the buffer at `offset`.

### buf.readUInt8(offset)
### buf.readUInt16BE(offset)
### buf.readUInt16LE(offset)
### buf.readUInt32BE(offset)
### buf.readUInt32LE(offset)
### buf.readInt8(offset)
### buf.readInt16BE(offset)
### buf.readInt16LE(offset)
### buf.readInt32BE(offset)
### buf.readInt32LE(offset)
### buf.readFloatBE(offset)
### buf.readFloatLE(offset)
### buf.readDoubleBE(offset)
### buf.readDoubleLE(offset)

Read numeric values from the buffer at the specified offset.

### buf.writeUInt8(value, offset)
### buf.writeUInt16BE(value, offset)
### buf.writeUInt16LE(value, offset)
### buf.writeUInt32BE(value, offset)
### buf.writeUInt32LE(value, offset)
### buf.writeInt8(value, offset)
### buf.writeInt16BE(value, offset)
### buf.writeInt16LE(value, offset)
### buf.writeInt32BE(value, offset)
### buf.writeInt32LE(value, offset)
### buf.writeFloatBE(value, offset)
### buf.writeFloatLE(value, offset)
### buf.writeDoubleBE(value, offset)
### buf.writeDoubleLE(value, offset)

Write numeric values to the buffer at the specified offset.

### buf.length

The number of bytes in the buffer.

## Examples

### Creating Buffers

```javascript
export async function handler(event) {
  // From string
  const buf1 = Buffer.from('Hello, World!', 'utf8');
  
  // From array of bytes
  const buf2 = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  
  // Allocate with size
  const buf3 = Buffer.alloc(10); // Filled with zeros
  const buf4 = Buffer.alloc(10, 'a'); // Filled with 'a'
  
  // Allocate unsafe (faster, uninitialized)
  const buf5 = Buffer.allocUnsafe(10);
  buf5.fill(0); // Should initialize before use
  
  return {
    buf1: buf1.toString(),
    buf2: buf2.toString(),
    buf3Length: buf3.length
  };
}
```

### Encoding and Decoding

```javascript
export async function handler(event) {
  const text = 'Hello, World!';
  
  // Encode to different formats
  const utf8Buffer = Buffer.from(text, 'utf8');
  const base64 = utf8Buffer.toString('base64');
  const hex = utf8Buffer.toString('hex');
  const ascii = utf8Buffer.toString('ascii');
  
  // Decode from base64
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  
  return {
    original: text,
    base64,
    hex,
    ascii,
    decoded
  };
}
```

### Binary Data Operations

```javascript
export async function handler(event) {
  // Create a buffer for binary data
  const buf = Buffer.alloc(8);
  
  // Write numbers in different formats
  buf.writeUInt8(0xFF, 0);           // Write byte at offset 0
  buf.writeUInt16BE(0xABCD, 1);      // Write 16-bit big-endian at offset 1
  buf.writeInt32LE(-12345, 3);       // Write 32-bit little-endian at offset 3
  buf.writeUInt8(0x42, 7);           // Write byte at offset 7
  
  // Read the values back
  const byte = buf.readUInt8(0);
  const uint16 = buf.readUInt16BE(1);
  const int32 = buf.readInt32LE(3);
  
  return {
    buffer: buf.toString('hex'),
    byte,
    uint16,
    int32
  };
}
```

### Concatenating Buffers

```javascript
export async function handler(event) {
  const buf1 = Buffer.from('Hello, ');
  const buf2 = Buffer.from('World');
  const buf3 = Buffer.from('!');
  
  // Concatenate multiple buffers
  const result = Buffer.concat([buf1, buf2, buf3]);
  
  return {
    message: result.toString(),
    length: result.length
  };
}
```

### Working with Binary File Data

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  // Read binary file
  const imageData = await fs.readFile('/tmp/image.png');
  
  // Check if it's a PNG (magic bytes: 89 50 4E 47)
  const isPNG = imageData[0] === 0x89 &&
                imageData[1] === 0x50 &&
                imageData[2] === 0x4E &&
                imageData[3] === 0x47;
  
  // Convert to base64 for transmission
  const base64Image = imageData.toString('base64');
  
  // Get slice of buffer
  const header = imageData.slice(0, 8);
  
  return {
    isPNG,
    size: imageData.length,
    headerHex: header.toString('hex'),
    base64Preview: base64Image.substring(0, 50) + '...'
  };
}
```

### Buffer Comparison and Manipulation

```javascript
export async function handler(event) {
  const buf1 = Buffer.from('ABC');
  const buf2 = Buffer.from('ABC');
  const buf3 = Buffer.from('ABCD');
  
  // Compare buffers
  const areEqual = buf1.equals(buf2);
  const compareResult = buf1.compare(buf3);
  
  // Copy buffer
  const buf4 = Buffer.alloc(buf1.length);
  buf1.copy(buf4);
  
  // Fill buffer
  const buf5 = Buffer.alloc(10);
  buf5.fill('ab');
  
  return {
    areEqual,
    compareResult,
    copied: buf4.toString(),
    filled: buf5.toString()
  };
}
```

## Next Steps

- [Working with streams](./stream.md)
- [String decoder module](./string_decoder.md)
- [File operations with fs](./fs.md)
- [Crypto operations](./crypto.md)

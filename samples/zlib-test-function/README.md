# Zlib Test Function

Comprehensive test suite for Node.js v24.x zlib API compatibility in the VM environment.

## Features Tested

### Core Functionality
- ✅ All synchronous convenience methods (`deflateSync`, `inflateSync`, `gzipSync`, `gunzipSync`, etc.)
- ✅ All asynchronous convenience methods with callback support
- ✅ All Transform stream classes (`Deflate`, `Inflate`, `Gzip`, `Gunzip`, etc.)
- ✅ Factory methods (`createDeflate`, `createInflate`, etc.)
- ✅ Constants and utility functions

### Compression Algorithms
- ✅ **Deflate/Inflate** - Standard zlib compression
- ✅ **Gzip/Gunzip** - Gzip format compression
- ✅ **Raw Deflate/Inflate** - Raw deflate without headers
- ✅ **Brotli** - Modern compression algorithm
- ✅ **Unzip** - Auto-detection decompression
- ✅ **Zstd** - Experimental Zstandard compression (if available)

### Advanced Features
- ✅ **Chunked Transfer** - Optimized handling of large data (>64KB)
- ✅ **Stream Backpressure** - Proper flow control in Transform streams
- ✅ **ZlibBase Methods** - `flush()`, `params()`, `reset()`, `close()`
- ✅ **Compression Options** - Level, strategy, window bits, memory level
- ✅ **Brotli Parameters** - Quality, mode, window size
- ✅ **Error Handling** - Proper error serialization across VM boundary

### Data Types Tested
- Small text data (< 1KB)
- Medium text data (~5KB)
- Large text data (~100KB)
- Binary data with various byte patterns
- Invalid/corrupted data for error handling

### Stream Features
- Event handling (`data`, `end`, `error`, `close`)
- Backpressure and flow control
- Multiple write operations
- Stream state tracking (`bytesRead`, `bytesWritten`)
- Proper cleanup and resource management

## Usage

### Direct Execution
```bash
node index.js
```

### As Invoke Function
Deploy and call via HTTP:
```bash
curl -X POST http://localhost:3000/api/functions/invoke \
  -H "Content-Type: application/json" \
  -d '{"functionId": "zlib-test-function"}'
```

## Expected Output

The test suite provides detailed output including:
- Individual test results with ✓/✗ indicators
- Performance metrics (compression ratios, processing times)
- Memory usage statistics
- Error details for any failing tests
- Final summary with success rate

## Implementation Details

### Cross-VM Data Transfer
- Uses ArrayBuffer ↔ Buffer conversion for binary data
- Implements chunked transfer for large data (>64KB)
- Preserves Node.js error codes and properties across VM boundary

### Stream Implementation
- Extends `require('stream').Transform` from polyfill
- Handle-based stateful object management on host side
- Event bridging between host streams and VM Transform instances
- Proper backpressure handling and flow control

### Error Handling
- Follows `__ZLIB_ERROR__:` serialization pattern
- Preserves `code`, `errno`, `syscall` properties
- Maintains Node.js error semantics in VM environment

## Compatibility

This implementation provides complete Node.js v24.x zlib API compatibility including:
- All 22 compression/decompression methods
- 11 Transform stream classes
- Full constants exposure
- Utility functions (`crc32`)
- Experimental features (Zstd)
- Advanced options and parameters

## Performance Optimizations

- **Chunked Processing**: Large buffers (>64KB) use streaming approach
- **Handle Reuse**: Efficient stateful object management
- **Event Batching**: Minimizes VM boundary crossings
- **Memory Management**: Automatic cleanup of stream handles
- **Compression Ratio Reporting**: Real-time efficiency metrics
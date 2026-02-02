# HTTP/WebSocket Test Function

Comprehensive test suite for HTTP, HTTPS, and WebSocket functionality in the VM environment.

## Features Tested

### HTTP Client
- ✅ HTTP GET requests
- ✅ HTTP POST requests with JSON data
- ✅ Header processing (headers, headersDistinct, rawHeaders)
- ✅ Agent connection pooling with keepAlive
- ✅ Error handling and status codes
- ✅ Request/response streaming

### HTTPS Client  
- ✅ HTTPS GET requests with TLS
- ✅ Certificate validation
- ✅ Secure connections

### WebSocket Client
- ✅ WebSocket connection establishment
- ✅ Text and binary message sending/receiving
- ✅ Ping/pong frame handling
- ✅ Close handshake with codes
- ✅ RFC 6455 compliance

### Server Stubs
- ✅ HTTP/HTTPS/WebSocket server stubs throw ENOTSUP errors
- ✅ Proper error codes and messages

## Usage

This function tests the complete HTTP/WebSocket implementation:

```javascript
const testResult = await require('./index.js')(req, res);
```

## Test Results

Returns comprehensive test results with:
- Individual test status (passed/failed)
- Error messages and stack traces for failures
- Summary of total tests passed/failed
- Detailed validation of Node.js API compatibility

## Node.js Compatibility

Tests exact Node.js behavior including:
- IncomingMessage properties (statusCode, headers, rawHeaders)
- ClientRequest methods (write, end, setTimeout)
- Agent socket pooling and reuse
- WebSocket RFC 6455 frame handling
- Error codes and message formats
- Header case sensitivity and duplicate handling

## Network Requirements

Tests require internet access to:
- httpbin.org (HTTP/HTTPS testing)
- echo.websocket.org (WebSocket testing)

All tests include timeouts and error handling for robust testing in various network conditions.
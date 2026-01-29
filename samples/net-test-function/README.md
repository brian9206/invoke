# Net Module Test Function

This test function verifies that the `net` module is properly exposed in the Invoke VM environment by implementing a working HTTP client.

## What it tests

1. **Socket Creation** - Verifies that sockets can be created and have the expected methods
2. **Socket Methods** - Verifies all key socket methods are available:
   - `write()` - Write data to socket
   - `read()` - Read data from socket
   - `pause()` / `resume()` - Flow control
   - `end()` / `destroy()` - Cleanup
   - `setTimeout()` - Set socket timeout
   - `setNoDelay()` - TCP_NODELAY option
   - `setKeepAlive()` - TCP keep-alive
3. **Method Chaining** - Confirms methods return the socket for chaining
4. **HTTP Client** - Real-world test that:
   - Connects to example.com:80
   - Sends an HTTP GET request
   - Receives and parses the HTTP response
   - Verifies status code and headers
   - Extracts response body

## Expected Results

The test should complete without errors and report:
- Socket creation successful
- All socket methods available and callable
- Method chaining working correctly
- HTTP request sent successfully
- HTTP response received and parsed correctly (status 200)
- Response headers extracted (content-type, content-length, etc.)
- Response body retrieved

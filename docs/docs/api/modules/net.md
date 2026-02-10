# net

The `net` module provides an asynchronous network API for creating TCP servers and clients. It's the foundation for many network protocols.

## Import

```javascript
const net = require('net');
```

## API Reference

### net.createServer([options][, connectionListener])

Creates a new TCP server.

**Returns:** `net.Server` instance

### net.createConnection(options[, connectListener])
### net.createConnection(path[, connectListener])
### net.createConnection(port[, host][, connectListener])

Creates a new TCP connection.

**Returns:** `net.Socket` instance

### net.connect()

Alias for `net.createConnection()`.

### Class: net.Server

Represents a TCP server.

#### server.listen(port[, host][, backlog][, callback])

Starts listening for connections.

#### server.close([callback])

Stops the server from accepting new connections.

#### server.address()

Returns server address information.

#### Event: 'connection'

Emitted when a new connection is made.

#### Event: 'listening'

Emitted when the server starts listening.

#### Event: 'close'

Emitted when the server closes.

#### Event: 'error'

Emitted when an error occurs.

### Class: net.Socket

Represents a TCP socket.

#### socket.connect(options[, connectListener])

Opens connection to a server.

#### socket.write(data[, encoding][, callback])

Sends data on socket.

#### socket.end([data][, encoding][, callback])

Half-closes the socket.

#### socket.destroy([error])

Ensures no more I/O activity on socket.

#### socket.setTimeout(timeout[, callback])

Sets socket timeout.

#### Event: 'connect'

Emitted when connection is established.

#### Event: 'data'

Emitted when data is received.

#### Event: 'end'

Emitted when other end sends FIN packet.

#### Event: 'close'

Emitted when socket is fully closed.

#### Event: 'error'

Emitted when an error occurs.

## Examples

### Basic TCP Client

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'example.com';
  const port = event.port || 80;
  
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host, port }, () => {
      console.log('Connected to server');
      
      // Send HTTP request
      client.write('GET / HTTP/1.1\r\n');
      client.write(`Host: ${host}\r\n`);
      client.write('Connection: close\r\n');
      client.write('\r\n');
    });
    
    let data = '';
    
    client.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    client.on('end', () => {
      resolve({
        host,
        port,
        responseLength: data.length,
        preview: data.substring(0, 200)
      });
    });
    
    client.on('error', reject);
  });
}
```

### TCP Echo Client

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'localhost';
  const port = event.port || 7; // Echo port
  const message = event.message || 'Hello, Server!';
  
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    
    client.connect(port, host, () => {
      console.log('Connected');
      client.write(message);
    });
    
    client.on('data', (data) => {
      console.log('Received:', data.toString());
      resolve({
        sent: message,
        received: data.toString()
      });
      client.destroy();
    });
    
    client.on('close', () => {
      console.log('Connection closed');
    });
    
    client.on('error', reject);
  });
}
```

### TCP Client with Timeout

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'example.com';
  const port = event.port || 80;
  const timeoutMs = event.timeout || 5000;
  
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host, port });
    
    client.setTimeout(timeoutMs);
    
    client.on('connect', () => {
      client.write('GET / HTTP/1.1\r\nHost: ' + host + '\r\n\r\n');
    });
    
    let data = '';
    
    client.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Connection timeout after ${timeoutMs}ms`));
    });
    
    client.on('end', () => {
      resolve({
        host,
        port,
        dataLength: data.length
      });
    });
    
    client.on('error', reject);
  });
}
```

### Checking Socket Connection

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'google.com';
  const port = event.port || 80;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.connect(port, host, () => {
      const connectTime = Date.now() - startTime;
      socket.destroy();
      
      resolve({
        host,
        port,
        reachable: true,
        connectTime: connectTime + 'ms',
        localAddress: socket.localAddress,
        localPort: socket.localPort
      });
    });
    
    socket.on('error', (err) => {
      resolve({
        host,
        port,
        reachable: false,
        error: err.message
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        host,
        port,
        reachable: false,
        error: 'Connection timeout'
      });
    });
  });
}
```

### Port Scanner

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'localhost';
  const startPort = event.startPort || 1;
  const endPort = event.endPort || 100;
  
  async function checkPort(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(1000);
      
      socket.connect(port, host, () => {
        socket.destroy();
        resolve({ port, open: true });
      });
      
      socket.on('error', () => {
        resolve({ port, open: false });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ port, open: false });
      });
    });
  }
  
  const results = [];
  const openPorts = [];
  
  for (let port = startPort; port <= endPort; port++) {
    const result = await checkPort(port);
    results.push(result);
    if (result.open) {
      openPorts.push(port);
    }
  }
  
  return {
    host,
    scannedRange: `${startPort}-${endPort}`,
    totalScanned: results.length,
    openPorts,
    openCount: openPorts.length
  };
}
```

### TCP Proxy (Simple)

```javascript
const net = require('net');

export async function handler(event) {
  const targetHost = event.targetHost || 'example.com';
  const targetPort = event.targetPort || 80;
  const message = event.message || 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n';
  
  return new Promise((resolve, reject) => {
    // Connect to target
    const targetSocket = net.createConnection({
      host: targetHost,
      port: targetPort
    });
    
    // Send data
    targetSocket.write(message);
    
    let response = '';
    
    targetSocket.on('data', (data) => {
      response += data.toString();
    });
    
    targetSocket.on('end', () => {
      resolve({
        target: `${targetHost}:${targetPort}`,
        sent: message.length,
        received: response.length,
        preview: response.substring(0, 200)
      });
    });
    
    targetSocket.on('error', reject);
  });
}
```

### Socket Information

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'example.com';
  const port = event.port || 80;
  
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    
    socket.on('connect', () => {
      const info = {
        connected: true,
        localAddress: socket.localAddress,
        localPort: socket.localPort,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        remoteFamily: socket.remoteFamily,
        bytesRead: socket.bytesRead,
        bytesWritten: socket.bytesWritten
      };
      
      socket.destroy();
      resolve(info);
    });
    
    socket.on('error', reject);
  });
}
```

### Connection Pooling

```javascript
const net = require('net');

class ConnectionPool {
  constructor(host, port, maxConnections = 5) {
    this.host = host;
    this.port = port;
    this.maxConnections = maxConnections;
    this.pool = [];
  }
  
  async getConnection() {
    // Return existing idle connection
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    
    // Create new connection
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: this.host,
        port: this.port
      });
      
      socket.on('connect', () => {
        resolve(socket);
      });
      
      socket.on('error', reject);
    });
  }
  
  releaseConnection(socket) {
    if (this.pool.length < this.maxConnections) {
      this.pool.push(socket);
    } else {
      socket.destroy();
    }
  }
}

export async function handler(event) {
  const pool = new ConnectionPool('example.com', 80, 3);
  
  // Get connection
  const conn = await pool.getConnection();
  
  // Use connection
  conn.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
  
  return new Promise((resolve) => {
    let data = '';
    
    conn.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    conn.on('end', () => {
      pool.releaseConnection(conn);
      
      resolve({
        message: 'Request completed',
        poolSize: pool.pool.length,
        dataLength: data.length
      });
    });
  });
}
```

### TCP Keep-Alive

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'example.com';
  const port = event.port || 80;
  
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    
    socket.setKeepAlive(true, 1000); // Enable keep-alive with 1s initial delay
    
    socket.on('connect', () => {
      console.log('Connection established with keep-alive');
      
      const info = {
        host,
        port,
        keepAliveEnabled: true,
        localAddress: socket.localAddress,
        remoteAddress: socket.remoteAddress
      };
      
      socket.destroy();
      resolve(info);
    });
    
    socket.on('error', reject);
  });
}
```

### Socket Pausing and Resuming

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'example.com';
  const port = event.port || 80;
  
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    
    socket.on('connect', () => {
      socket.write('GET / HTTP/1.1\r\nHost: ' + host + '\r\n\r\n');
    });
    
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      
      // Pause after receiving data
      socket.pause();
      
      // Resume after 100ms
      setTimeout(() => {
        socket.resume();
      }, 100);
    });
    
    socket.on('end', () => {
      const data = Buffer.concat(chunks).toString();
      
      resolve({
        chunksReceived: chunks.length,
        totalBytes: data.length,
        preview: data.substring(0, 200)
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Binary Protocol Communication

```javascript
const net = require('net');

export async function handler(event) {
  const host = event.host || 'localhost';
  const port = event.port || 9000;
  
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    
    socket.on('connect', () => {
      // Send binary data
      const buffer = Buffer.alloc(10);
      buffer.writeUInt16BE(0x1234, 0);
      buffer.writeUInt32BE(0x56789ABC, 2);
      buffer.writeUInt32BE(0xDEF01234, 6);
      
      socket.write(buffer);
    });
    
    socket.on('data', (data) => {
      // Parse binary response
      const values = {
        byte0: data[0],
        byte1: data[1],
        uint16: data.readUInt16BE(0),
        uint32: data.readUInt32BE(2)
      };
      
      socket.destroy();
      resolve(values);
    });
    
    socket.on('error', (err) => {
      resolve({
        error: err.message,
        note: 'Make sure server is running'
      });
    });
  });
}
```

## Best Practices

- **Handle all error events** - Unhandled errors crash the process
- **Use timeouts** - Prevent hanging connections
- **Destroy sockets properly** - Call `socket.destroy()` to clean up
- **Handle backpressure** - Check return value of `socket.write()`
- **Use keep-alive for long connections** - Detect broken connections
- **Implement connection pooling** - Reuse connections efficiently
- **Set reasonable buffer sizes** - Don't exceed memory limits

## Common Use Cases

- **HTTP clients** - Low-level HTTP requests
- **TCP proxies** - Forward connections to other servers
- **Port scanners** - Check port availability
- **Custom protocols** - Implement binary protocols
- **Database drivers** - Connect to databases using TCP
- **Message queues** - Implement custom messaging

## Next Steps

- [TLS/SSL connections](./tls.md)
- [HTTP protocol](./http.md)
- [HTTPS protocol](./https.md)
- [DNS resolution](./dns.md)
- [Stream processing](./stream.md)

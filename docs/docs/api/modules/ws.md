# ws

The `ws` module provides a WebSocket client implementation for real-time, bidirectional communication over a persistent connection.

## Import

```javascript
const WebSocket = require('ws');
```

## API Reference

### new WebSocket(address[, protocols][, options])

Create a new WebSocket client instance.

**Parameters:**
- `address` - WebSocket server URL (ws:// or wss://)
- `protocols` - Sub-protocol(s) to use
- `options` - Connection options

**Returns:** WebSocket instance

### WebSocket Properties

#### ws.readyState

Current connection state:
- `WebSocket.CONNECTING` (0) - Connection not yet open
- `WebSocket.OPEN` (1) - Connection open and ready
- `WebSocket.CLOSING` (2) - Connection closing
- `WebSocket.CLOSED` (3) - Connection closed

#### ws.url

The WebSocket URL.

#### ws.protocol

The sub-protocol selected by the server.

### WebSocket Methods

#### ws.send(data[, options][, callback])

Send data through the WebSocket.

#### ws.close([code][, reason])

Close the WebSocket connection.

#### ws.ping([data][, mask][, callback])

Send a ping frame.

#### ws.pong([data][, mask][, callback])

Send a pong frame.

### WebSocket Events

#### Event: 'open'

Emitted when connection is established.

#### Event: 'message'

Emitted when a message is received.

#### Event: 'close'

Emitted when connection closes.

#### Event: 'error'

Emitted when an error occurs.

#### Event: 'ping'

Emitted when a ping is received.

#### Event: 'pong'

Emitted when a pong is received.

## Examples

### Basic WebSocket Connection

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    
    ws.on('open', () => {
      console.log('WebSocket connected');
      ws.send('Hello WebSocket!');
    });
    
    ws.on('message', (data) => {
      console.log('Received:', data.toString());
      messages.push(data.toString());
      ws.close();
    });
    
    ws.on('close', () => {
      resolve({
        url,
        messagesReceived: messages.length,
        messages: messages
      });
    });
    
    ws.on('error', reject);
  });
}
```

### Send and Receive JSON

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      const message = {
        type: 'greeting',
        text: 'Hello',
        timestamp: Date.now()
      };
      
      ws.send(JSON.stringify(message));
    });
    
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        ws.close();
        
        resolve({
          success: true,
          received: parsed
        });
      } catch (error) {
        resolve({
          success: true,
          receivedRaw: data.toString()
        });
      }
    });
    
    ws.on('error', reject);
  });
}
```

### Connection with Timeout

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  const timeoutMs = event.timeout || 5000;
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        ws.close();
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    
    ws.on('open', () => {
      connected = true;
      clearTimeout(timeout);
      
      ws.send('Test message');
    });
    
    ws.on('message', (data) => {
      ws.close();
      
      resolve({
        connected: true,
        echo: data.toString()
      });
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
```

### Send Multiple Messages

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  const messageCount = event.count || 3;
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const received = [];
    let sent = 0;
    
    ws.on('open', () => {
      for (let i = 1; i <= messageCount; i++) {
        ws.send(`Message ${i}`);
        sent++;
      }
    });
    
    ws.on('message', (data) => {
      received.push(data.toString());
      
      if (received.length === messageCount) {
        ws.close();
      }
    });
    
    ws.on('close', () => {
      resolve({
        sent: sent,
        received: received.length,
        messages: received
      });
    });
    
    ws.on('error', reject);
  });
}
```

### Binary Data (Buffer)

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      // Send binary data
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      ws.send(buffer, { binary: true });
    });
    
    ws.on('message', (data) => {
      ws.close();
      
      resolve({
        receivedType: Buffer.isBuffer(data) ? 'Buffer' : 'String',
        length: data.length,
        data: Array.from(data)
      });
    });
    
    ws.on('error', reject);
  });
}
```

### Ping/Pong Heartbeat

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let pongReceived = false;
    
    ws.on('open', () => {
      // Send ping
      ws.ping();
    });
    
    ws.on('pong', () => {
      console.log('Pong received');
      pongReceived = true;
      
      // Send a message after pong
      ws.send('Hello after ping/pong');
    });
    
    ws.on('message', (data) => {
      ws.close();
      
      resolve({
        pongReceived: pongReceived,
        echo: data.toString()
      });
    });
    
    ws.on('error', reject);
  });
}
```

### Connection State Tracking

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const states = [];
    
    const trackState = (event) => {
      const stateNames = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED'
      };
      
      states.push({
        event: event,
        state: stateNames[ws.readyState],
        stateCode: ws.readyState
      });
    };
    
    trackState('initial');
    
    ws.on('open', () => {
      trackState('open');
      ws.send('Test');
    });
    
    ws.on('message', () => {
      trackState('message');
      ws.close();
    });
    
    ws.on('close', () => {
      trackState('close');
      
      resolve({
        url,
        stateTransitions: states
      });
    });
    
    ws.on('error', reject);
  });
}
```

### Error Handling

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://invalid-websocket-url-12345.com';
  
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let errorOccurred = false;
    
    ws.on('open', () => {
      ws.send('Connected successfully');
    });
    
    ws.on('message', (data) => {
      ws.close();
      resolve({
        success: true,
        message: data.toString()
      });
    });
    
    ws.on('error', (error) => {
      errorOccurred = true;
      resolve({
        success: false,
        error: error.message,
        errorCode: error.code
      });
    });
    
    ws.on('close', () => {
      if (!errorOccurred) {
        resolve({
          success: false,
          message: 'Connection closed without error'
        });
      }
    });
  });
}
```

### Reconnection Logic

```javascript
const WebSocket = require('ws');

class ReconnectingWebSocket {
  constructor(url, maxRetries = 3) {
    this.url = url;
    this.maxRetries = maxRetries;
    this.retries = 0;
    this.ws = null;
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', () => {
        this.retries = 0; // Reset on successful connection
        resolve(this.ws);
      });
      
      this.ws.on('error', (error) => {
        if (this.retries < this.maxRetries) {
          this.retries++;
          console.log(`Retry ${this.retries}/${this.maxRetries}`);
          
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, 1000 * this.retries);
        } else {
          reject(new Error('Max retries reached'));
        }
      });
    });
  }
}

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  
  const rws = new ReconnectingWebSocket(url, 3);
  
  try {
    const ws = await rws.connect();
    
    ws.send('Connected with retry logic');
    
    return new Promise((resolve) => {
      ws.on('message', (data) => {
        ws.close();
        resolve({
          success: true,
          retriesNeeded: rws.retries,
          message: data.toString()
        });
      });
    });
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Custom Headers (Authentication)

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  const token = event.token || 'sample-token';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Invoke-Function-WS',
        'X-Custom-Header': 'custom-value'
      }
    });
    
    ws.on('open', () => {
      ws.send('Authenticated connection');
    });
    
    ws.on('message', (data) => {
      ws.close();
      
      resolve({
        authenticated: true,
        response: data.toString()
      });
    });
    
    ws.on('error', (error) => {
      resolve({
        authenticated: false,
        error: error.message
      });
    });
  });
}
```

### Message Queue with WebSocket

```javascript
const WebSocket = require('ws');

export async function handler(event) {
  const url = event.url || 'wss://echo.websocket.org';
  const messages = event.messages || ['Message 1', 'Message 2', 'Message 3'];
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue = [...messages];
    const responses = [];
    
    ws.on('open', () => {
      // Send first message
      if (queue.length > 0) {
        ws.send(queue.shift());
      }
    });
    
    ws.on('message', (data) => {
      responses.push(data.toString());
      
      // Send next message in queue
      if (queue.length > 0) {
        ws.send(queue.shift());
      } else {
        // All messages sent and received
        ws.close();
      }
    });
    
    ws.on('close', () => {
      resolve({
        sent: messages.length,
        received: responses.length,
        responses: responses
      });
    });
    
    ws.on('error', reject);
  });
}
```

## Best Practices

- **Handle all events** - Implement open, message, close, and error handlers
- **Close connections** - Always call `ws.close()` when done
- **Check readyState** - Verify connection state before sending
- **Implement reconnection** - Handle disconnections gracefully
- **Use ping/pong** - Maintain connection health
- **Validate messages** - Parse and validate incoming data
- **Set timeouts** - Don't wait indefinitely for responses
- **Handle backpressure** - Check `bufferedAmount` for flow control

## Common Use Cases

- **Real-time notifications** - Push updates to clients
- **Chat applications** - Bidirectional messaging
- **Live data feeds** - Stock prices, sports scores
- **Remote monitoring** - IoT device communication
- **Collaborative tools** - Real-time editing
- **Gaming** - Multiplayer game state synchronization

## WebSocket vs HTTP

| Feature | WebSocket | HTTP |
|---------|-----------|------|
| Connection | Persistent | Request/response |
| Overhead | Low (after handshake) | High (per request) |
| Latency | Very low | Higher |
| Bidirectional | Yes | No (client to server) |
| Use case | Real-time | Traditional web |

## Next Steps

- [HTTP module](./http.md)
- [HTTPS module](./https.md)
- [Events module](./events.md)
- [Stream processing](./stream.md)

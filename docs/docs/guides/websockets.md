# WebSockets Guide

Learn how to use WebSocket clients in your Invoke functions.

## Basic Usage

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://echo.websocket.org');
    
    ws.on('open', () => {
        console.log('Connected');
        ws.send('Hello Server!');
    });
    
    ws.on('message', (data) => {
        console.log('Received:', data.toString());
        ws.close();
        res.json({ received: data.toString() });
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        res.status(500).json({ error: error.message });
    });
};
```

## Connection Options

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://example.com/socket', {
        headers: {
            'Authorization': `Bearer ${process.env.WS_TOKEN}`,
            'User-Agent': 'Invoke-Function/1.0'
        },
        handshakeTimeout: 10000,
        perMessageDeflate: true
    });
    
    // ... handle events
};
```

## Sending Messages

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://example.com/socket');
    
    ws.on('open', () => {
        // Send text
        ws.send('Hello');
        
        // Send JSON
        ws.send(JSON.stringify({ type: 'message', text: 'Hello' }));
        
        // Send binary
        ws.send(Buffer.from('binary data'));
    });
    
    res.send('Messages sent');
};
```

## Receiving Messages

```javascript
const { WebSocket } = require('ws');

module.exports = async function(req, res) {
    const ws = new WebSocket('wss://example.com/socket');
    const messages = [];
    
    ws.on('message', (data) => {
        // Data can be string or Buffer
        const message = data.toString();
        console.log('Received:', message);
        
        // Parse JSON if needed
        try {
            const json = JSON.parse(message);
            messages.push(json);
        } catch (e) {
            messages.push(message);
        }
    });
    
    // Wait for completion
    await new Promise((resolve) => {
        ws.on('close', resolve);
        setTimeout(() => {
            ws.close();
            resolve();
        }, 5000);
    });
    
    res.json({ messages });
};
```

## Error Handling

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://example.com/socket');
    
    ws.on('error', (error) => {
        console.error('Connection error:', error);
        res.status(500).json({ error: 'WebSocket connection failed' });
    });
    
    ws.on('close', (code, reason) => {
        console.log(`Connection closed: ${code} - ${reason}`);
    });
    
    ws.on('open', () => {
        ws.send('Hello');
    });
};
```

## Ping/Pong (Heartbeat)

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://example.com/socket');
    
    ws.on('open', () => {
        // Send ping every 30 seconds
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                clearInterval(interval);
            }
        }, 30000);
    });
    
    ws.on('pong', () => {
        console.log('Received pong');
    });
    
    ws.on('close', () => {
        res.send('Connection closed');
    });
};
```

## Common Patterns

### Request-Response Pattern

```javascript
const { WebSocket } = require('ws');

async function sendAndWait(url, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout'));
        }, timeout);
        
        ws.on('open', () => {
            ws.send(message);
        });
        
        ws.on('message', (data) => {
            clearTimeout(timer);
            ws.close();
            resolve(data.toString());
        });
        
        ws.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

module.exports = async function(req, res) {
    try {
        const response = await sendAndWait(
            'wss://example.com/api',
            JSON.stringify(req.body)
        );
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
```

### Streaming Data

```javascript
const { WebSocket } = require('ws');

module.exports = async function(req, res) {
    const ws = new WebSocket('wss://stream.example.com');
    const dataPoints = [];
    
    ws.on('open', () => {
        ws.send(JSON.stringify({ subscribe: 'ticker', symbol: 'BTC' }));
    });
    
    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        dataPoints.push(message);
        
        // Stop after collecting 10 data points
        if (dataPoints.length >= 10) {
            ws.close();
        }
    });
    
    await new Promise((resolve) => ws.on('close', resolve));
    
    res.json({ dataPoints });
};
```

### Authentication

```javascript
const { WebSocket } = require('ws');

module.exports = async function(req, res) {
    const token = process.env.WS_AUTH_TOKEN;
    
    const ws = new WebSocket('wss://example.com/socket', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    ws.on('open', () => {
        // Or send auth message after connection
        ws.send(JSON.stringify({
            type: 'auth',
            token: token
        }));
    });
    
    // ... handle messages
};
```

## Connection States

```javascript
const { WebSocket } = require('ws');

module.exports = function(req, res) {
    const ws = new WebSocket('wss://example.com/socket');
    
    console.log(ws.readyState); // WebSocket.CONNECTING (0)
    
    ws.on('open', () => {
        console.log(ws.readyState); // WebSocket.OPEN (1)
    });
    
    ws.on('close', () => {
        console.log(ws.readyState); // WebSocket.CLOSED (3)
    });
    
    // Check state before sending
    if (ws.readyState === WebSocket.OPEN) {
        ws.send('message');
    }
};
```

## Best Practices

### 1. Always Handle Errors

```javascript
ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Handle error appropriately
});
```

### 2. Set Timeouts

```javascript
const timeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.CLOSED) {
        ws.close();
    }
}, 30000);

ws.on('close', () => clearTimeout(timeout));
```

### 3. Close Connections

```javascript
// Always close when done
ws.on('message', (data) => {
    // Process data
    ws.close(); // Close after receiving
});
```

### 4. Validate Messages

```javascript
ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        // Process valid JSON
    } catch (error) {
        console.error('Invalid message format');
    }
});
```

## Next Steps

- [WS Module](/docs/api/modules/ws) - Complete API reference
- [HTTP Requests](/docs/guides/http-requests) - Alternative communication
- [Net Module](/docs/api/modules/net) - TCP sockets

# events

The `events` module provides the `EventEmitter` class, which is used to handle events. Many objects in Node.js emit events, and you can create your own event emitters.

## Import

```javascript
const { EventEmitter } = require('events');
// or
const EventEmitter = require('events');
```

## API Reference

### Class: EventEmitter

#### emitter.on(eventName, listener)

Adds the `listener` function to the end of the listeners array for the event named `eventName`.

**Parameters:**
- `eventName` - The name of the event
- `listener` - The callback function

**Returns:** Reference to the EventEmitter for chaining

#### emitter.once(eventName, listener)

Adds a one-time `listener` function for the event. The listener is invoked only the next time the event is fired, after which it is removed.

#### emitter.off(eventName, listener)

Removes the specified `listener` from the listener array for the event named `eventName`.

#### emitter.removeListener(eventName, listener)

Alias for `emitter.off()`.

#### emitter.removeAllListeners([eventName])

Removes all listeners, or those of the specified `eventName`.

#### emitter.emit(eventName[, ...args])

Synchronously calls each of the listeners registered for the event named `eventName`, in the order they were registered, passing the supplied arguments to each.

**Returns:** `true` if the event had listeners, `false` otherwise

#### emitter.listenerCount(eventName)

Returns the number of listeners listening to the event named `eventName`.

#### emitter.listeners(eventName)

Returns a copy of the array of listeners for the event named `eventName`.

#### emitter.eventNames()

Returns an array listing the events for which the emitter has registered listeners.

#### emitter.setMaxListeners(n)

Sets the maximum number of listeners that can be added to the EventEmitter (default is 10).

#### emitter.getMaxListeners()

Returns the current max listener value for the EventEmitter.

#### emitter.prependListener(eventName, listener)

Adds the `listener` function to the beginning of the listeners array for the event named `eventName`.

#### emitter.prependOnceListener(eventName, listener)

Adds a one-time `listener` function to the beginning of the listeners array.

### Static Methods

#### EventEmitter.defaultMaxListeners

By default, a maximum of 10 listeners can be registered for any single event. This limit can be changed for individual EventEmitter instances using `emitter.setMaxListeners()`.

#### events.once(emitter, name)

Creates a Promise that is fulfilled when the EventEmitter emits the given event.

## Examples

### Basic Event Emitter

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const myEmitter = new EventEmitter();
  
  // Register event listener
  myEmitter.on('greeting', (name) => {
    console.log(`Hello, ${name}!`);
  });
  
  // Emit event
  myEmitter.emit('greeting', 'Alice');
  myEmitter.emit('greeting', 'Bob');
  
  return { eventsEmitted: 2 };
}
```

### Custom Event Emitter Class

```javascript
const { EventEmitter } = require('events');

class TaskProcessor extends EventEmitter {
  constructor() {
    super();
  }
  
  async processTask(task) {
    this.emit('start', task);
    
    try {
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = { taskId: task.id, status: 'completed' };
      
      this.emit('complete', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

export async function handler(event) {
  const processor = new TaskProcessor();
  
  // Register event listeners
  processor.on('start', (task) => {
    console.log('Task started:', task.id);
  });
  
  processor.on('complete', (result) => {
    console.log('Task completed:', result);
  });
  
  processor.on('error', (error) => {
    console.error('Task failed:', error.message);
  });
  
  // Process task
  const result = await processor.processTask({ id: event.taskId });
  
  return result;
}
```

### One-Time Listeners

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  // This listener fires only once
  emitter.once('connection', () => {
    console.log('First connection established');
  });
  
  // This listener fires every time
  emitter.on('connection', () => {
    console.log('A connection was made');
  });
  
  emitter.emit('connection'); // Both fire
  emitter.emit('connection'); // Only the second fires
  emitter.emit('connection'); // Only the second fires
  
  return { 
    listeners: emitter.listenerCount('connection') 
  };
}
```

### Multiple Listeners and Event Data

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  // Multiple listeners for the same event
  emitter.on('data', (data) => {
    console.log('Logger 1:', data);
  });
  
  emitter.on('data', (data) => {
    console.log('Logger 2:', data);
  });
  
  emitter.on('data', (data) => {
    console.log('Logger 3:', data);
  });
  
  // Emit with multiple arguments
  emitter.emit('data', { 
    type: 'user_action',
    userId: event.userId,
    timestamp: Date.now()
  });
  
  return {
    listenerCount: emitter.listenerCount('data'),
    eventNames: emitter.eventNames()
  };
}
```

### Removing Listeners

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  const listener1 = () => console.log('Listener 1');
  const listener2 = () => console.log('Listener 2');
  const listener3 = () => console.log('Listener 3');
  
  emitter.on('test', listener1);
  emitter.on('test', listener2);
  emitter.on('test', listener3);
  
  console.log('Before removal:', emitter.listenerCount('test')); // 3
  
  // Remove specific listener
  emitter.off('test', listener2);
  
  console.log('After removing listener2:', emitter.listenerCount('test')); // 2
  
  // Remove all listeners for specific event
  emitter.removeAllListeners('test');
  
  console.log('After removing all:', emitter.listenerCount('test')); // 0
  
  return { success: true };
}
```

### Error Event Handling

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  // Error event is special - if no listener, it throws
  emitter.on('error', (error) => {
    console.error('Caught error:', error.message);
  });
  
  // Safe to emit error now
  emitter.emit('error', new Error('Something went wrong'));
  
  return { handled: true };
}
```

### Using events.once() for Promises

```javascript
const { EventEmitter, once } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  // Simulate async operation that emits event
  setTimeout(() => {
    emitter.emit('response', { data: 'Hello' });
  }, 100);
  
  // Wait for event using Promise
  const [response] = await once(emitter, 'response');
  
  return {
    message: 'Event received',
    data: response
  };
}
```

### Prepending Listeners

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  // Add listener normally (goes to end)
  emitter.on('order', () => console.log('Second'));
  emitter.on('order', () => console.log('Third'));
  
  // Prepend to beginning
  emitter.prependListener('order', () => console.log('First'));
  
  emitter.emit('order');
  // Output:
  // First
  // Second
  // Third
  
  return { success: true };
}
```

### Managing Max Listeners

```javascript
const { EventEmitter } = require('events');

export async function handler(event) {
  const emitter = new EventEmitter();
  
  console.log('Default max:', emitter.getMaxListeners()); // 10
  
  // Increase max listeners to avoid warnings
  emitter.setMaxListeners(20);
  
  // Add many listeners
  for (let i = 0; i < 15; i++) {
    emitter.on('event', () => console.log(`Listener ${i}`));
  }
  
  console.log('Listener count:', emitter.listenerCount('event'));
  
  emitter.emit('event');
  
  return { 
    maxListeners: emitter.getMaxListeners(),
    actualListeners: emitter.listenerCount('event')
  };
}
```

### Real-World Example: Request Handler

```javascript
const { EventEmitter } = require('events');

class RequestHandler extends EventEmitter {
  async handleRequest(request) {
    this.emit('request:start', request);
    
    try {
      // Validate
      this.emit('request:validate', request);
      if (!request.userId) {
        throw new Error('Missing userId');
      }
      
      // Process
      this.emit('request:process', request);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Complete
      const response = { 
        success: true, 
        userId: request.userId,
        timestamp: Date.now()
      };
      this.emit('request:complete', response);
      
      return response;
    } catch (error) {
      this.emit('request:error', error);
      throw error;
    }
  }
}

export async function handler(event) {
  const handler = new RequestHandler();
  
  // Setup monitoring
  handler.on('request:start', (req) => {
    console.log('[START]', req.userId);
  });
  
  handler.on('request:validate', (req) => {
    console.log('[VALIDATE]', req.userId);
  });
  
  handler.on('request:process', (req) => {
    console.log('[PROCESS]', req.userId);
  });
  
  handler.on('request:complete', (res) => {
    console.log('[COMPLETE]', res);
  });
  
  handler.on('request:error', (err) => {
    console.error('[ERROR]', err.message);
  });
  
  // Handle request
  const response = await handler.handleRequest(event);
  
  return response;
}
```

## Best Practices

- Always handle the 'error' event to prevent crashes
- Use `once()` for events that should fire only once
- Clean up listeners with `removeListener()` to prevent memory leaks
- Use descriptive event names (e.g., 'data:received', 'connection:closed')
- Consider using `setMaxListeners()` for components with many listeners

## Next Steps

- [Stream module (uses EventEmitter)](./stream.md)
- [Process events](./process.md)
- [WebSocket Guide](/docs/guides/websockets)

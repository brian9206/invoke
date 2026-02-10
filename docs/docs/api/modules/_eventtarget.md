# _eventtarget

The `_eventtarget` module provides a Web-standard EventTarget interface implementation for Node.js, enabling standard DOM event patterns in a server-side environment.

## Import

```javascript
const { EventTarget, Event } = require('_eventtarget');
```

## API Reference

### Class: EventTarget

Web-standard EventTarget interface.

#### eventTarget.addEventListener(type, listener[, options])

Register an event listener.

**Parameters:**
- `type` - Event type string
- `listener` - Event listener function or object with handleEvent method
- `options` - Options object or boolean (useCapture)
  - `once` - Remove listener after first invocation
  - `passive` - Listener will never call preventDefault()
  - `signal` - AbortSignal to remove listener

#### eventTarget.removeEventListener(type, listener[, options])

Remove an event listener.

**Parameters:**
- `type` - Event type string
- `listener` - Event listener function
- `options` - Options object or boolean (useCapture)

#### eventTarget.dispatchEvent(event)

Dispatch an event to registered listeners.

**Parameters:**
- `event` - Event object

**Returns:** `true` if event is cancelable and preventDefault() was not called

### Class: Event

Represents an event.

#### new Event(type[, options])

Create a new Event.

**Parameters:**
- `type` - Event type string
- `options` - Event options
  - `bubbles` - Whether event bubbles (default: false)
  - `cancelable` - Whether event can be canceled (default: false)
  - `composed` - Whether event triggers listeners outside shadow root (default: false)

#### event.type

Event type string (read-only).

#### event.target

Event target (read-only).

#### event.currentTarget

Current event target in bubbling phase (read-only).

#### event.bubbles

Whether event bubbles (read-only).

#### event.cancelable

Whether event can be canceled (read-only).

#### event.defaultPrevented

Whether preventDefault() was called (read-only).

#### event.preventDefault()

Cancel the event if cancelable.

#### event.stopPropagation()

Stop propagation to other listeners.

#### event.stopImmediatePropagation()

Stop propagation including current target's remaining listeners.

## Examples

### Basic Event Listener

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const events = [];
  
  // Add event listener
  target.addEventListener('message', (e) => {
    events.push({
      type: e.type,
      timestamp: Date.now()
    });
  });
  
  // Dispatch event
  target.dispatchEvent(new Event('message'));
  
  return {
    eventsReceived: events.length,
    events: events
  };
}
```

### Custom Event Data

```javascript
const { EventTarget, Event } = require('_eventtarget');

class CustomEvent extends Event {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

export async function handler(event) {
  const target = new EventTarget();
  let receivedData = null;
  
  target.addEventListener('data', (e) => {
    receivedData = e.detail;
  });
  
  const customEvent = new CustomEvent('data', {
    detail: {
      message: 'Hello',
      value: 42,
      timestamp: Date.now()
    }
  });
  
  target.dispatchEvent(customEvent);
  
  return {
    sent: customEvent.detail,
    received: receivedData,
    matches: JSON.stringify(customEvent.detail) === JSON.stringify(receivedData)
  };
}
```

### Once Listener

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  let callCount = 0;
  
  // Listener that runs only once
  target.addEventListener('click', () => {
    callCount++;
  }, { once: true });
  
  // Dispatch multiple times
  target.dispatchEvent(new Event('click'));
  target.dispatchEvent(new Event('click'));
  target.dispatchEvent(new Event('click'));
  
  return {
    dispatched: 3,
    listenerCalled: callCount,
    note: 'Listener runs only once due to { once: true }'
  };
}
```

### Multiple Listeners

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const log = [];
  
  // Add multiple listeners for same event
  target.addEventListener('action', () => {
    log.push('Listener 1');
  });
  
  target.addEventListener('action', () => {
    log.push('Listener 2');
  });
  
  target.addEventListener('action', () => {
    log.push('Listener 3');
  });
  
  // Dispatch event
  target.dispatchEvent(new Event('action'));
  
  return {
    listenersTriggered: log.length,
    executionOrder: log
  };
}
```

### Remove Event Listener

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const events = [];
  
  const listener = (e) => {
    events.push(e.type);
  };
  
  // Add listener
  target.addEventListener('test', listener);
  
  // Dispatch - listener will fire
  target.dispatchEvent(new Event('test'));
  
  // Remove listener
  target.removeEventListener('test', listener);
  
  // Dispatch again - listener won't fire
  target.dispatchEvent(new Event('test'));
  
  return {
    eventsReceived: events.length,
    note: 'Only first dispatch triggered listener'
  };
}
```

### AbortSignal to Remove Listener

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const controller = new AbortController();
  const events = [];
  
  // Add listener with AbortSignal
  target.addEventListener('message', (e) => {
    events.push(e.type);
  }, { signal: controller.signal });
  
  // Dispatch - listener fires
  target.dispatchEvent(new Event('message'));
  
  // Abort - removes listener
  controller.abort();
  
  // Dispatch - listener doesn't fire
  target.dispatchEvent(new Event('message'));
  
  return {
    eventsReceived: events.length,
    aborted: controller.signal.aborted,
    note: 'Listener removed via AbortSignal'
  };
}
```

### Event Cancellation

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  let defaultActionRan = true;
  
  target.addEventListener('submit', (e) => {
    e.preventDefault(); // Cancel default action
    defaultActionRan = false;
  });
  
  const submitEvent = new Event('submit', { cancelable: true });
  const notCanceled = target.dispatchEvent(submitEvent);
  
  return {
    eventWasCancelable: submitEvent.cancelable,
    defaultPrevented: submitEvent.defaultPrevented,
    dispatchReturnValue: notCanceled,
    defaultActionRan: defaultActionRan
  };
}
```

### Stop Propagation

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const log = [];
  
  target.addEventListener('click', (e) => {
    log.push('Listener 1');
    e.stopPropagation(); // Stop propagation
  });
  
  target.addEventListener('click', () => {
    log.push('Listener 2'); // Won't run
  });
  
  target.addEventListener('click', () => {
    log.push('Listener 3'); // Won't run
  });
  
  target.dispatchEvent(new Event('click'));
  
  return {
    totalListeners: 3,
    listenersExecuted: log.length,
    executionLog: log,
    note: 'stopPropagation() prevents remaining listeners'
  };
}
```

### Event Type Filtering

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const log = [];
  
  // Different event types
  target.addEventListener('start', () => log.push('start'));
  target.addEventListener('process', () => log.push('process'));
  target.addEventListener('end', () => log.push('end'));
  
  // Dispatch in sequence
  target.dispatchEvent(new Event('start'));
  target.dispatchEvent(new Event('process'));
  target.dispatchEvent(new Event('end'));
  
  return {
    eventsDispatched: 3,
    executionSequence: log
  };
}
```

### Custom EventTarget Class

```javascript
const { EventTarget, Event } = require('_eventtarget');

class DataStore extends EventTarget {
  constructor() {
    super();
    this.data = {};
  }
  
  set(key, value) {
    const oldValue = this.data[key];
    this.data[key] = value;
    
    // Dispatch change event
    this.dispatchEvent(new Event('change'));
    
    // Dispatch specific key event
    const keyEvent = new Event(`change:${key}`);
    keyEvent.detail = { key, oldValue, newValue: value };
    this.dispatchEvent(keyEvent);
  }
  
  get(key) {
    return this.data[key];
  }
}

export async function handler(event) {
  const store = new DataStore();
  const changes = [];
  
  store.addEventListener('change', () => {
    changes.push('generic change');
  });
  
  store.addEventListener('change:name', (e) => {
    changes.push(`name changed to ${e.detail.newValue}`);
  });
  
  store.set('name', 'Alice');
  store.set('age', 30);
  
  return {
    storeData: store.data,
    changesDetected: changes.length,
    changeLog: changes
  };
}
```

### Event-Driven State Machine

```javascript
const { EventTarget, Event } = require('_eventtarget');

class StateMachine extends EventTarget {
  constructor(initialState) {
    super();
    this.state = initialState;
  }
  
  transition(newState) {
    const oldState = this.state;
    this.state = newState;
    
    const event = new Event('stateChange');
    event.detail = { from: oldState, to: newState };
    this.dispatchEvent(event);
  }
}

export async function handler(event) {
  const machine = new StateMachine('idle');
  const transitions = [];
  
  machine.addEventListener('stateChange', (e) => {
    transitions.push(`${e.detail.from} → ${e.detail.to}`);
  });
  
  machine.transition('loading');
  machine.transition('processing');
  machine.transition('complete');
  
  return {
    currentState: machine.state,
    totalTransitions: transitions.length,
    transitionHistory: transitions
  };
}
```

### Async Event Handler

```javascript
const { EventTarget, Event } = require('_eventtarget');

export async function handler(event) {
  const target = new EventTarget();
  const results = [];
  
  target.addEventListener('fetch', async (e) => {
    results.push('Started');
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    results.push('Completed');
  });
  
  target.dispatchEvent(new Event('fetch'));
  
  // Wait for async handler
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return {
    asyncHandlerExecuted: true,
    results: results
  };
}
```

## Best Practices

- **Use standard Web APIs** - Familiar to web developers
- **Extend EventTarget** - Create custom event-driven classes
- **Use specific event types** - Clear, descriptive event names
- **Include event details** - Extend Event class for custom data
- **Clean up listeners** - Remove listeners or use AbortSignal
- **Use once for single-use** - Automatic cleanup
- **Don't overuse events** - Direct function calls can be simpler

## Common Use Cases

- **Custom event emitters** - Alternative to EventEmitter
- **State management** - Event-driven state changes
- **Plugin systems** - Allow extensions via events
- **Data stores** - Notify on data changes
- **Async coordination** - Signal completion of operations
- **Web-compatible code** - Code that runs in browser and Node.js

## EventTarget vs EventEmitter

| Feature | EventTarget | EventEmitter |
|---------|-------------|--------------|
| Standard | Web standard | Node.js standard |
| Method names | addEventListener | on/addListener |
| Event objects | Required | Optional |
| Once support | Built-in option | once() method |
| Cancelation | preventDefault() | N/A |
| AbortSignal | Supported | Not supported |

## Next Steps

- [Events module (EventEmitter)](./events.md)
- [Async coordination](./timers.md)
- [Process events](./process.md)

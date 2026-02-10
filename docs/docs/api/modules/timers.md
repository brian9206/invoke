# timers

The `timers` module provides functions for scheduling code execution after a certain period of time. It includes both callback-based and promise-based APIs.

## Import

```javascript
// Timer functions are available globally
// or import explicitly:
const { setTimeout, setInterval, setImmediate, clearTimeout, clearInterval, clearImmediate } = require('timers');

// For promise-based API:
const { setTimeout: setTimeoutPromise, setImmediate: setImmediatePromise, setInterval: setIntervalPromise } = require('timers/promises');
```

## API Reference

### setTimeout(callback, delay[, ...args])

Schedules execution of a one-time callback after delay milliseconds.

**Parameters:**
- `callback` - Function to execute
- `delay` - Delay in milliseconds (minimum 1ms)
- `...args` - Additional arguments to pass to the callback

**Returns:** A Timeout object

### clearTimeout(timeout)

Cancels a Timeout object created by setTimeout().

### setInterval(callback, delay[, ...args])

Schedules repeated execution of callback every delay milliseconds.

**Returns:** A Timeout object

### clearInterval(timeout)

Cancels a Timeout object created by setInterval().

### setImmediate(callback[, ...args])

Schedules immediate execution of callback after I/O events callbacks.

**Returns:** An Immediate object

### clearImmediate(immediate)

Cancels an Immediate object created by setImmediate().

## Promises API

### timers/promises.setTimeout(delay[, value[, options]])

Returns a Promise that resolves after delay milliseconds.

### timers/promises.setImmediate([value[, options]])

Returns a Promise that resolves after the current event loop iteration.

### timers/promises.setInterval(delay[, value[, options]])

Returns an async iterator that generates values every delay milliseconds.

## Examples

### Basic setTimeout

```javascript
export async function handler(event) {
  console.log('Start');
  
  // Schedule callback after 1 second
  setTimeout(() => {
    console.log('Executed after 1 second');
  }, 1000);
  
  // Use await to wait for completion
  await new Promise(resolve => setTimeout(resolve, 1100));
  
  console.log('End');
  
  return { message: 'Timer completed' };
}
```

### setTimeout with Arguments

```javascript
export async function handler(event) {
  function greet(name, message) {
    console.log(`${message}, ${name}!`);
  }
  
  // Pass arguments to callback
  setTimeout(greet, 100, 'Alice', 'Hello');
  setTimeout(greet, 200, 'Bob', 'Hi');
  
  // Wait for timers
  await new Promise(resolve => setTimeout(resolve, 300));
  
  return { message: 'Greetings sent' };
}
```

### Clearing Timeouts

```javascript
export async function handler(event) {
  const results = [];
  
  // Schedule timer
  const timer = setTimeout(() => {
    results.push('This should not execute');
  }, 100);
  
  // Cancel before it fires
  clearTimeout(timer);
  
  // Wait to ensure it was cancelled
  await new Promise(resolve => setTimeout(resolve, 200));
  
  results.push('Timer was cancelled');
  
  return { results };
}
```

### Using setInterval

```javascript
export async function handler(event) {
  const results = [];
  let count = 0;
  
  // Repeat every 100ms
  const interval = setInterval(() => {
    count++;
    results.push(`Tick ${count}`);
    
    // Stop after 5 ticks
    if (count >= 5) {
      clearInterval(interval);
    }
  }, 100);
  
  // Wait for interval to complete
  await new Promise(resolve => setTimeout(resolve, 600));
  
  return { results, count };
}
```

### Using setImmediate

```javascript
export async function handler(event) {
  const operations = [];
  
  operations.push('1. Synchronous');
  
  // Execute after I/O events
  setImmediate(() => {
    operations.push('3. Immediate');
  });
  
  // Execute in next event loop tick
  setTimeout(() => {
    operations.push('4. Timeout');
  }, 0);
  
  operations.push('2. Synchronous');
  
  // Wait for async operations
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return { operations };
}
```

### Promise-based setTimeout

```javascript
const { setTimeout } = require('timers/promises');

export async function handler(event) {
  console.log('Start');
  
  // Wait 1 second using promises
  await setTimeout(1000);
  
  console.log('After 1 second');
  
  // Wait and return a value
  const result = await setTimeout(500, 'Done waiting');
  
  console.log(result); // 'Done waiting'
  
  return { message: 'Completed' };
}
```

### Promise-based setImmediate

```javascript
const { setImmediate } = require('timers/promises');

export async function handler(event) {
  console.log('Start');
  
  // Yield to event loop
  await setImmediate();
  
  console.log('After immediate');
  
  // Return a value
  const value = await setImmediate('Result');
  
  return { value };
}
```

### Promise-based setInterval

```javascript
const { setInterval } = require('timers/promises');

export async function handler(event) {
  const results = [];
  let count = 0;
  
  // Create async iterator
  const interval = setInterval(100);
  
  // Iterate over intervals
  for await (const timestamp of interval) {
    count++;
    results.push(`Tick ${count} at ${timestamp}`);
    
    // Stop after 5 iterations
    if (count >= 5) {
      break;
    }
  }
  
  return { results, count };
}
```

### Aborting Promise-based Timers

```javascript
const { setTimeout } = require('timers/promises');

export async function handler(event) {
  const controller = new AbortController();
  const { signal } = controller;
  
  // Abort after 500ms
  setTimeout(500).then(() => {
    controller.abort();
  });
  
  try {
    // This will be aborted
    await setTimeout(1000, undefined, { signal });
    return { message: 'Completed' };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { message: 'Timer was aborted' };
    }
    throw error;
  }
}
```

### Delayed Function Execution

```javascript
export async function handler(event) {
  function executeTask(taskId, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`Task ${taskId} executed`);
        resolve({ taskId, completedAt: Date.now() });
      }, delay);
    });
  }
  
  // Execute tasks with different delays
  const results = await Promise.all([
    executeTask(1, 100),
    executeTask(2, 200),
    executeTask(3, 50)
  ]);
  
  return { results };
}
```

### Polling with setInterval

```javascript
export async function handler(event) {
  let attempts = 0;
  const maxAttempts = 10;
  
  // Simulate checking for a condition
  function checkCondition() {
    attempts++;
    const ready = Math.random() > 0.7; // 30% chance
    console.log(`Attempt ${attempts}: ${ready ? 'Ready!' : 'Not ready'}`);
    return ready;
  }
  
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (checkCondition()) {
        clearInterval(interval);
        resolve({
          success: true,
          attempts
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error('Max attempts reached'));
      }
    }, 100);
  });
}
```

### Debouncing with Timers

```javascript
export async function handler(event) {
  function debounce(func, delay) {
    let timeoutId;
    
    return function(...args) {
      clearTimeout(timeoutId);
      return new Promise(resolve => {
        timeoutId = setTimeout(() => {
          resolve(func(...args));
        }, delay);
      });
    };
  }
  
  // Function to debounce
  function processInput(input) {
    console.log('Processing:', input);
    return { processed: input.toUpperCase() };
  }
  
  const debouncedProcess = debounce(processInput, 200);
  
  // Rapid calls - only last one executes
  debouncedProcess('first');
  debouncedProcess('second');
  const result = await debouncedProcess('third');
  
  return result;
}
```

### Throttling with Timers

```javascript
export async function handler(event) {
  function throttle(func, delay) {
    let lastCall = 0;
    
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func(...args);
      }
      return null;
    };
  }
  
  const results = [];
  
  function logMessage(message) {
    results.push({ message, timestamp: Date.now() });
  }
  
  const throttledLog = throttle(logMessage, 100);
  
  // Rapid calls - some are ignored
  for (let i = 0; i < 10; i++) {
    throttledLog(`Message ${i}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  
  return { 
    callsMade: 10,
    callsExecuted: results.length,
    results 
  };
}
```

### Timeout with Promise Race

```javascript
export async function handler(event) {
  async function fetchWithTimeout(url, timeoutMs) {
    const fetchPromise = simulateFetch(url);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);
    });
    
    return Promise.race([fetchPromise, timeoutPromise]);
  }
  
  async function simulateFetch(url) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
    return { data: 'Response from ' + url };
  }
  
  try {
    const result = await fetchWithTimeout('https://api.example.com', 1000);
    return result;
  } catch (error) {
    return { error: error.message };
  }
}
```

### Retry with Exponential Backoff

```javascript
export async function handler(event) {
  async function retryWithBackoff(fn, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.log(`Retry ${i + 1} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
  
  let attempts = 0;
  
  async function unreliableOperation() {
    attempts++;
    if (attempts < 3) {
      throw new Error(`Attempt ${attempts} failed`);
    }
    return { success: true, attempts };
  }
  
  try {
    const result = await retryWithBackoff(unreliableOperation);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      attempts
    };
  }
}
```

## Execution Order

Understanding the execution order of timers:

1. **Synchronous code** executes first
2. **process.nextTick()** callbacks execute
3. **Promise microtasks** execute
4. **setImmediate()** callbacks execute
5. **setTimeout()/setInterval()** callbacks execute (macrotasks)

## Best Practices

- Use promise-based timers (`timers/promises`) for cleaner async code
- Always clear intervals when done to prevent memory leaks
- Use `setImmediate()` for deferring work, not `setTimeout(fn, 0)`
- Consider using `AbortController` with promise-based timers for cancellation
- Be careful with intervals - ensure they clear properly
- For delays, prefer `timers/promises.setTimeout()` over callback-based version

## Next Steps

- [Timers and Async Patterns Guide](/docs/guides/timers-async)
- [Event loop and process](./process.md)
- [Global APIs](/docs/api/globals)

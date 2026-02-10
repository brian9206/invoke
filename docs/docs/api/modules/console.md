# console

The `console` module provides a simple debugging console similar to the JavaScript console provided by web browsers. Output is directed to the function logs.

## Import

```javascript
// console is available globally, no import needed
// or explicitly:
const console = require('console');
```

## API Reference

### console.log([data][, ...args])

Prints to stdout with newline. Multiple arguments can be passed, with the first used as the primary message and all additional used as substitution values.

### console.info([data][, ...args])

Alias for `console.log()`.

### console.warn([data][, ...args])

Prints to stderr. Functions the same as `console.log()` but outputs to stderr.

### console.error([data][, ...args])

Prints to stderr. Functions the same as `console.warn()`.

### console.debug([data][, ...args])

Alias for `console.log()`.

### console.trace([message][, ...args])

Prints the message and stack trace to stderr.

### console.assert(value[, ...message])

A simple assertion test that verifies whether `value` is truthy. If not, logs an assertion error message.

### console.dir(obj[, options])

Uses `util.inspect()` on `obj` and prints the result to stdout.

**Options:**
- `showHidden` - If `true`, shows non-enumerable properties (default: false)
- `depth` - How many times to recurse while formatting object (default: 2)
- `colors` - If `true`, output is styled with ANSI color codes (default: false)

### console.time([label])

Starts a timer that can be used to compute the duration of an operation. Timers are identified by a unique label.

### console.timeEnd([label])

Stops a timer that was previously started by calling `console.time()` and prints the result to stdout.

### console.timeLog([label][, ...data])

For a timer that was previously started by calling `console.time()`, prints the elapsed time and other data arguments to stdout.

### console.count([label])

Maintains an internal counter specific to `label` and prints the count.

### console.countReset([label])

Resets the internal counter specific to `label`.

### console.clear()

Attempts to clear the console (implementation-dependent).

### console.table(tabularData[, properties])

Logs tabular data as a table (simplified in non-browser environments).

## Examples

### Basic Logging

```javascript
export async function handler(event) {
  // Simple logging
  console.log('Function started');
  console.log('Event received:', event);
  
  // Multiple arguments
  const userId = event.userId;
  const action = event.action;
  console.log('User %s performed action: %s', userId, action);
  
  // Warning and error
  console.warn('This is a warning message');
  console.error('This is an error message');
  
  return { status: 'completed' };
}
```

### Debugging with console.dir

```javascript
export async function handler(event) {
  const complexObject = {
    user: {
      id: 123,
      name: 'Alice',
      metadata: {
        created: new Date(),
        tags: ['premium', 'verified']
      }
    }
  };
  
  // Deep inspection
  console.dir(complexObject, { depth: null, colors: true });
  
  // Show hidden properties
  console.dir(Object, { showHidden: true });
  
  return { inspected: true };
}
```

### Performance Timing

```javascript
export async function handler(event) {
  // Start timer
  console.time('database-query');
  
  // Simulate database operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Log intermediate time
  console.timeLog('database-query', 'Query executed');
  
  // Additional processing
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // End timer
  console.timeEnd('database-query');
  
  return { message: 'Operation completed' };
}
```

### Counting Operations

```javascript
export async function handler(event) {
  const items = ['a', 'b', 'a', 'c', 'b', 'a', 'd'];
  
  // Count occurrences
  items.forEach(item => {
    console.count(item);
  });
  
  // Reset a counter
  console.countReset('a');
  console.count('a'); // Starts at 1 again
  
  return { processed: items.length };
}
```

### Assertions and Stack Traces

```javascript
export async function handler(event) {
  const userId = event.userId;
  const userRole = event.role;
  
  // Assert conditions
  console.assert(userId, 'userId is required');
  console.assert(userRole === 'admin' || userRole === 'user', 
                 'Invalid role:', userRole);
  
  // Print stack trace for debugging
  if (event.debug) {
    console.trace('Debug mode enabled, showing stack trace');
  }
  
  return { validated: true };
}
```

### Structured Logging

```javascript
export async function handler(event) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    userId: event.userId,
    action: event.action,
    duration: 123,
    success: true
  };
  
  // Log as JSON for structured logging systems
  console.log(JSON.stringify(logEntry));
  
  // Log table (simplified)
  const data = [
    { name: 'Alice', age: 30, role: 'admin' },
    { name: 'Bob', age: 25, role: 'user' },
    { name: 'Carol', age: 35, role: 'user' }
  ];
  console.table(data);
  
  return { logged: true };
}
```

### Error Logging with Context

```javascript
export async function handler(event) {
  try {
    // Attempt operation
    const result = await riskyOperation(event);
    console.log('Operation succeeded:', result);
    return result;
  } catch (error) {
    // Log error with full context
    console.error('Operation failed');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Event:', JSON.stringify(event));
    console.error('Timestamp:', new Date().toISOString());
    
    throw error;
  }
}

async function riskyOperation(event) {
  if (!event.data) {
    throw new Error('Missing data field');
  }
  return { processed: true };
}
```

### Conditional Debug Logging

```javascript
const DEBUG = process.env.DEBUG === 'true';

export async function handler(event) {
  if (DEBUG) {
    console.debug('=== Debug Mode ===');
    console.debug('Event:', event);
    console.debug('Environment:', process.env);
  }
  
  console.log('Processing request');
  
  const result = await processData(event.data);
  
  if (DEBUG) {
    console.debug('Result:', result);
  }
  
  return result;
}

async function processData(data) {
  return { processed: true, data };
}
```

## Best Practices

- Use `console.error()` for errors and `console.warn()` for warnings
- Leverage `console.time()`/`console.timeEnd()` for performance monitoring
- Use structured JSON logging for production environments
- Consider log levels and avoid excessive logging in hot paths
- Use `console.assert()` for development-time checks

## Next Steps

- [Process and environment variables](./process.md)
- [Util module for formatting](./util.md)
- [Debugging Guide](/docs/advanced/debugging)

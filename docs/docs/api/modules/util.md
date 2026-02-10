# util

The `util` module provides utility functions primarily useful for debugging and implementing internal Node.js APIs. It includes functions for formatting strings, inspecting objects, and working with promises.

## Import

```javascript
const util = require('util');
```

## API Reference

### util.format(format[, ...args])

Returns a formatted string using the first argument as a printf-like format string.

**Format specifiers:**
- `%s` - String
- `%d` - Number (integer or floating point)
- `%i` - Integer
- `%f` - Floating point value
- `%j` - JSON
- `%o` - Object
- `%%` - Single percent sign

### util.inspect(object[, options])

Returns a string representation of object for debugging.

**Options:**
- `showHidden` - Show non-enumerable properties (default: false)
- `depth` - How deep to recurse (default: 2)
- `colors` - Use ANSI color codes (default: false)
- `maxArrayLength` - Maximum elements to show (default: 100)
- `breakLength` - Line length at which to break (default: 80)
- `compact` - Format output compactly (default: true)

### util.promisify(original)

Takes a function following the common error-first callback style and returns a version that returns promises.

### util.callbackify(original)

Takes an async function and returns a version that follows the error-first callback style.

### util.types.isDate(value)
### util.types.isRegExp(value)
### util.types.isPromise(value)
### util.types.isArrayBuffer(value)

Type checking functions.

### util.deprecate(fn, message[, code])

Wraps a function to emit a deprecation warning when called.

### util.inherits(constructor, superConstructor)

Deprecated: Use ES6 class syntax with extends instead.

## Examples

### String Formatting

```javascript
const util = require('util');

export async function handler(event) {
  const name = 'Alice';
  const age = 30;
  const score = 95.5;
  
  // Format strings
  const message1 = util.format('Hello, %s!', name);
  // Result: 'Hello, Alice!'
  
  const message2 = util.format('User %s is %d years old', name, age);
  // Result: 'User Alice is 30 years old'
  
  const message3 = util.format('Score: %f points', score);
  // Result: 'Score: 95.5 points'
  
  const obj = { id: 123, status: 'active' };
  const message4 = util.format('Data: %j', obj);
  // Result: 'Data: {"id":123,"status":"active"}'
  
  return {
    message1,
    message2,
    message3,
    message4
  };
}
```

### Object Inspection

```javascript
const util = require('util');

export async function handler(event) {
  const complexObject = {
    name: 'Alice',
    age: 30,
    address: {
      street: '123 Main St',
      city: 'New York',
      coordinates: {
        lat: 40.7128,
        lng: -74.0060
      }
    },
    hobbies: ['reading', 'cycling', 'photography'],
    metadata: {
      created: new Date(),
      updated: new Date()
    }
  };
  
  // Basic inspection
  const basic = util.inspect(complexObject);
  
  // With colors (good for console output)
  const colored = util.inspect(complexObject, { colors: true });
  
  // Deep inspection
  const deep = util.inspect(complexObject, { depth: null });
  
  // Compact format
  const compact = util.inspect(complexObject, { compact: true, breakLength: 60 });
  
  console.log('Inspected object:', colored);
  
  return {
    basic,
    compact
  };
}
```

### Promisifying Callback Functions

```javascript
const util = require('util');
const fs = require('fs');

// Promisify fs functions
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

export async function handler(event) {
  const filePath = '/tmp/test.txt';
  
  // Write file using promisified function
  await writeFileAsync(filePath, 'Hello, World!', 'utf8');
  
  // Read file using promisified function
  const content = await readFileAsync(filePath, 'utf8');
  
  return {
    success: true,
    content
  };
}
```

### Custom Function Promisification

```javascript
const util = require('util');

// Original callback-style function
function fetchData(id, callback) {
  setTimeout(() => {
    if (id > 0) {
      callback(null, { id, name: `User ${id}`, email: `user${id}@example.com` });
    } else {
      callback(new Error('Invalid ID'));
    }
  }, 100);
}

// Promisify it
const fetchDataAsync = util.promisify(fetchData);

export async function handler(event) {
  try {
    const user = await fetchDataAsync(event.userId || 123);
    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Callbackifying Async Functions

```javascript
const util = require('util');

// Async function
async function getUserData(userId) {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 50));
  
  if (!userId) {
    throw new Error('userId is required');
  }
  
  return {
    id: userId,
    name: `User ${userId}`,
    email: `user${userId}@example.com`
  };
}

// Convert to callback style
const getUserDataCallback = util.callbackify(getUserData);

export async function handler(event) {
  return new Promise((resolve, reject) => {
    getUserDataCallback(event.userId, (err, data) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, data });
      }
    });
  });
}
```

### Type Checking

```javascript
const util = require('util');

export async function handler(event) {
  const values = {
    date: new Date(),
    regex: /test/,
    promise: Promise.resolve(),
    buffer: Buffer.from('test'),
    array: [1, 2, 3],
    object: { key: 'value' },
    number: 42,
    string: 'hello'
  };
  
  const types = {
    date: util.types.isDate(values.date),
    regex: util.types.isRegExp(values.regex),
    promise: util.types.isPromise(values.promise),
    arrayBuffer: util.types.isArrayBuffer(values.buffer.buffer),
    map: util.types.isMap(new Map()),
    set: util.types.isSet(new Set()),
    weakMap: util.types.isWeakMap(new WeakMap()),
    weakSet: util.types.isWeakSet(new WeakSet())
  };
  
  return { types };
}
```

### Deprecation Warnings

```javascript
const util = require('util');

// Mark function as deprecated
const oldFunction = util.deprecate(
  function oldFunction() {
    return 'This function is deprecated';
  },
  'oldFunction() is deprecated. Use newFunction() instead.',
  'DEP0001'
);

function newFunction() {
  return 'This is the new function';
}

export async function handler(event) {
  // Using deprecated function will log a warning
  const oldResult = oldFunction();
  const newResult = newFunction();
  
  return {
    oldResult,
    newResult,
    message: 'Check logs for deprecation warning'
  };
}
```

### Debugging with util.inspect

```javascript
const util = require('util');

export async function handler(event) {
  // Create object with circular reference
  const obj = {
    name: 'Test',
    data: { value: 42 }
  };
  obj.self = obj; // Circular reference
  
  // util.inspect handles circular references
  const inspected = util.inspect(obj, {
    depth: 2,
    colors: false,
    showHidden: false
  });
  
  console.log('Inspected:', inspected);
  
  // Custom inspect for objects
  class CustomObject {
    constructor(name) {
      this.name = name;
      this.secret = 'hidden';
    }
    
    [util.inspect.custom](depth, options) {
      return `CustomObject { name: '${this.name}' }`;
    }
  }
  
  const custom = new CustomObject('MyObject');
  const customInspected = util.inspect(custom);
  
  return {
    inspected: inspected.substring(0, 100) + '...',
    customInspected
  };
}
```

### Format with Multiple Arguments

```javascript
const util = require('util');

export async function handler(event) {
  // Multiple replacements
  const formatted1 = util.format('%s:%s', 'Server', '3000');
  // Result: 'Server:3000'
  
  // Mixed types
  const formatted2 = util.format('User %s has %d points and scored %f%%', 'Alice', 100, 95.5);
  // Result: 'User Alice has 100 points and scored 95.5%'
  
  // JSON formatting
  const formatted3 = util.format('Config: %j', { debug: true, timeout: 5000 });
  // Result: 'Config: {"debug":true,"timeout":5000}'
  
  // Extra arguments are concatenated
  const formatted4 = util.format('Hello', 'World', '!');
  // Result: 'Hello World !'
  
  return {
    formatted1,
    formatted2,
    formatted3,
    formatted4
  };
}
```

### Custom Inspection Depth

```javascript
const util = require('util');

export async function handler(event) {
  const deepObject = {
    level1: {
      level2: {
        level3: {
          level4: {
            level5: {
              message: 'Deep value'
            }
          }
        }
      }
    }
  };
  
  // Different depths
  const depth0 = util.inspect(deepObject, { depth: 0 });
  const depth2 = util.inspect(deepObject, { depth: 2 });
  const depthNull = util.inspect(deepObject, { depth: null });
  
  return {
    depth0,    // Shows only top level
    depth2,    // Shows 2 levels deep
    depthNull  // Shows all levels
  };
}
```

### Promisify with Custom Symbol

```javascript
const util = require('util');

// Function with custom promisify behavior
function customFunction(arg, callback) {
  setTimeout(() => {
    callback(null, `Result: ${arg}`);
  }, 100);
}

// Define custom promisify behavior
customFunction[util.promisify.custom] = function(arg) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Custom Result: ${arg}`);
    }, 100);
  });
};

const customAsync = util.promisify(customFunction);

export async function handler(event) {
  const result = await customAsync('test');
  
  return {
    result
  };
}
```

### Comparing and Inspecting Arrays

```javascript
const util = require('util');

export async function handler(event) {
  const largeArray = Array.from({ length: 200 }, (_, i) => i);
  
  // Default shows max 100 items
  const defaultInspect = util.inspect(largeArray);
  
  // Show all items
  const allItems = util.inspect(largeArray, { maxArrayLength: null });
  
  // Show only 10 items
  const limitedItems = util.inspect(largeArray, { maxArrayLength: 10 });
  
  return {
    arrayLength: largeArray.length,
    defaultLength: defaultInspect.length,
    allItemsLength: allItems.length,
    limitedPreview: limitedItems
  };
}
```

## Best Practices

- Use `util.promisify()` to modernize callback-based APIs
- Use `util.inspect()` for debugging complex objects
- Prefer `util.format()` over string concatenation for logging
- Use type checking utilities for robust input validation
- Mark deprecated functions with `util.deprecate()` to help users migrate
- Use custom inspect functions for better debugging output

## Next Steps

- [Console logging](./console.md)
- [Global APIs](/docs/api/globals)
- [Process utilities](./process.md)
- [Best Practices](/docs/advanced/best-practices)

# assert

The `assert` module provides a set of assertion functions for verifying invariants in your function code. It's useful for testing and validating conditions during execution.

## Import

```javascript
const assert = require('assert');
// or for strict mode (recommended)
const assert = require('assert').strict;
```

## API Reference

### assert(value[, message])

Tests if `value` is truthy. Throws an `AssertionError` if the value is falsy.

**Parameters:**
- `value` - The value to test
- `message` (optional) - Custom error message

### assert.strictEqual(actual, expected[, message])

Tests strict equality between `actual` and `expected` using `===`.

**Parameters:**
- `actual` - The actual value
- `expected` - The expected value
- `message` (optional) - Custom error message

### assert.deepStrictEqual(actual, expected[, message])

Tests for deep equality between `actual` and `expected`, comparing all enumerable properties recursively.

**Parameters:**
- `actual` - The actual value
- `expected` - The expected value
- `message` (optional) - Custom error message

### assert.notStrictEqual(actual, expected[, message])

Tests strict inequality between `actual` and `expected`.

### assert.ok(value[, message])

Alias for `assert(value[, message])`. Tests if `value` is truthy.

### assert.throws(fn[, error][, message])

Expects the function `fn` to throw an error.

**Parameters:**
- `fn` - Function that should throw
- `error` (optional) - Expected error constructor, RegExp, or validation function
- `message` (optional) - Custom error message

### assert.doesNotThrow(fn[, error][, message])

Asserts that the function `fn` does not throw an error.

### assert.fail([message])

Throws an `AssertionError` with the provided error message.

### assert.ifError(value)

Throws `value` if `value` is not `undefined` or `null`. Useful for testing the error argument in callbacks.

## Examples

### Basic Assertions

```javascript
const assert = require('assert').strict;

export async function handler(event) {
  // Test truthy values
  assert(true, 'This should pass');
  assert(1, 'Non-zero numbers are truthy');
  
  // Test equality
  const result = 2 + 2;
  assert.strictEqual(result, 4, 'Math should work');
  
  // Test deep equality
  const obj1 = { name: 'Alice', age: 30 };
  const obj2 = { name: 'Alice', age: 30 };
  assert.deepStrictEqual(obj1, obj2, 'Objects should be deeply equal');
  
  return { success: true };
}
```

### Testing Function Errors

```javascript
const assert = require('assert').strict;

export async function handler(event) {
  // Test that a function throws
  assert.throws(
    () => {
      throw new Error('Expected error');
    },
    Error,
    'Should throw an error'
  );
  
  // Test with specific error message
  assert.throws(
    () => {
      throw new TypeError('Wrong type');
    },
    /Wrong type/,
    'Should throw TypeError with specific message'
  );
  
  // Test that a function doesn't throw
  assert.doesNotThrow(() => {
    return 42;
  });
  
  return { message: 'All assertions passed' };
}
```

### Using assert.ifError for Callbacks

```javascript
const assert = require('assert').strict;

export async function handler(event) {
  // Simulate callback pattern
  function doSomething(callback) {
    // Success case: callback(null, result)
    callback(null, 'Success');
  }
  
  doSomething((err, result) => {
    // Throws if err is not null/undefined
    assert.ifError(err);
    assert.strictEqual(result, 'Success');
  });
  
  return { status: 'completed' };
}
```

### Validating Input Data

```javascript
const assert = require('assert').strict;

export async function handler(event) {
  const { userId, email, age } = event;
  
  // Validate required fields
  assert(userId, 'userId is required');
  assert(email, 'email is required');
  
  // Validate types and values
  assert.strictEqual(typeof userId, 'string', 'userId must be a string');
  assert(email.includes('@'), 'email must contain @');
  assert(age >= 0 && age <= 150, 'age must be between 0 and 150');
  
  return {
    message: 'Validation passed',
    user: { userId, email, age }
  };
}
```

## Next Steps

- [Function Anatomy](/docs/getting-started/function-anatomy) - Learn about function structure
- [Global APIs](/docs/api/globals) - Available global APIs
- [Best Practices](/docs/advanced/best-practices) - Error handling patterns

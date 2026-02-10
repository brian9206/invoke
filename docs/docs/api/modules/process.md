# process

The `process` module provides information about and control over the current process. In the Invoke VM environment, certain process operations are restricted for security reasons.

## Import

```javascript
// process is available globally, no import needed
// or explicitly:
const process = require('process');
```

## API Reference

### process.env

An object containing the user environment variables. You can read environment variables but cannot modify them.

### process.argv

An array containing the command-line arguments. In Invoke functions, this typically contains minimal values.

### process.cwd()

Returns the current working directory of the process.

### process.version

A string containing the Node.js version.

### process.versions

An object containing version strings for Node.js and its dependencies.

### process.platform

A string identifying the operating system platform.

### process.arch

A string identifying the processor architecture.

### process.pid

The process ID.

### process.uptime()

Returns the number of seconds the process has been running.

### process.hrtime([time])
### process.hrtime.bigint()

Returns the current high-resolution real time in a `[seconds, nanoseconds]` tuple or as a BigInt.

### process.nextTick(callback[, ...args])

Adds `callback` to the "next tick queue". Once the current event loop turn runs to completion, all callbacks currently in the next tick queue will be called.

## Restrictions

The following process methods are **restricted** in the Invoke VM environment:

- ❌ `process.exit()` - Cannot terminate the process
- ❌ `process.abort()` - Cannot abort the process
- ❌ `process.kill()` - Cannot send signals to processes
- ❌ `process.chdir()` - Cannot change the working directory
- ❌ `process.setuid()` / `process.setgid()` - Cannot change user/group
- ❌ `process.setgroups()` - Cannot set supplementary groups
- ❌ Writing to `process.env` - Environment is read-only
- ❌ `process.dlopen()` - Cannot load native addons

## Examples

### Reading Environment Variables

```javascript
export async function handler(event) {
  // Access environment variables
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const apiKey = process.env.API_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  return {
    environment: nodeEnv,
    database: {
      host: dbHost,
      port: dbPort
    },
    hasApiKey: !!apiKey
  };
}
```

### Process Information

```javascript
export async function handler(event) {
  return {
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      cwd: process.cwd()
    },
    versions: process.versions
  };
}
```

### High-Resolution Timing

```javascript
export async function handler(event) {
  // Start timing
  const start = process.hrtime.bigint();
  
  // Perform operation
  await someOperation();
  
  // End timing
  const end = process.hrtime.bigint();
  
  // Calculate duration in milliseconds
  const durationNs = end - start;
  const durationMs = Number(durationNs) / 1_000_000;
  
  return {
    operation: 'completed',
    durationMs: durationMs.toFixed(3)
  };
}

async function someOperation() {
  return new Promise(resolve => setTimeout(resolve, 100));
}
```

### Using process.hrtime() for Timing

```javascript
export async function handler(event) {
  // Traditional hrtime API
  const start = process.hrtime();
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get elapsed time relative to start
  const elapsed = process.hrtime(start);
  
  // Convert to milliseconds
  const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1_000_000;
  
  return {
    seconds: elapsed[0],
    nanoseconds: elapsed[1],
    milliseconds: elapsedMs.toFixed(3)
  };
}
```

### process.nextTick for Deferring Execution

```javascript
export async function handler(event) {
  const operations = [];
  
  operations.push('1. Synchronous operation');
  
  // Schedule for next tick (before any I/O)
  process.nextTick(() => {
    operations.push('3. Next tick callback');
  });
  
  operations.push('2. Another synchronous operation');
  
  // Wait for next tick to complete
  await new Promise(resolve => process.nextTick(resolve));
  
  operations.push('4. After next tick');
  
  return { operations };
}
```

### Configuration from Environment

```javascript
export async function handler(event) {
  // Build configuration from environment variables
  const config = {
    api: {
      endpoint: process.env.API_ENDPOINT || 'https://api.example.com',
      timeout: parseInt(process.env.API_TIMEOUT || '5000'),
      retries: parseInt(process.env.API_RETRIES || '3')
    },
    features: {
      cacheEnabled: process.env.CACHE_ENABLED === 'true',
      debugMode: process.env.DEBUG === 'true',
      logLevel: process.env.LOG_LEVEL || 'info'
    },
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      name: process.env.DB_NAME || 'myapp',
      ssl: process.env.DB_SSL === 'true'
    }
  };
  
  return config;
}
```

### Checking Platform

```javascript
export async function handler(event) {
  const isLinux = process.platform === 'linux';
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  
  // Platform-specific behavior
  let pathSeparator;
  if (isWindows) {
    pathSeparator = '\\';
  } else {
    pathSeparator = '/';
  }
  
  return {
    platform: process.platform,
    isLinux,
    isWindows,
    isMac,
    arch: process.arch,
    pathSeparator
  };
}
```

### Memory Usage Information

```javascript
export async function handler(event) {
  // Get memory usage
  const memUsage = process.memoryUsage();
  
  // Convert to MB for readability
  const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  
  return {
    memory: {
      rss: formatBytes(memUsage.rss),           // Resident Set Size
      heapTotal: formatBytes(memUsage.heapTotal), // Total heap
      heapUsed: formatBytes(memUsage.heapUsed),  // Used heap
      external: formatBytes(memUsage.external)   // External memory
    }
  };
}
```

### Performance Monitoring

```javascript
export async function handler(event) {
  const metrics = {
    startTime: Date.now(),
    startHrTime: process.hrtime.bigint()
  };
  
  // Perform operations
  await performTask1();
  metrics.task1Complete = process.hrtime.bigint();
  
  await performTask2();
  metrics.task2Complete = process.hrtime.bigint();
  
  await performTask3();
  metrics.task3Complete = process.hrtime.bigint();
  
  // Calculate durations
  const task1Duration = Number(metrics.task1Complete - metrics.startHrTime) / 1_000_000;
  const task2Duration = Number(metrics.task2Complete - metrics.task1Complete) / 1_000_000;
  const task3Duration = Number(metrics.task3Complete - metrics.task2Complete) / 1_000_000;
  const totalDuration = Number(metrics.task3Complete - metrics.startHrTime) / 1_000_000;
  
  return {
    timings: {
      task1: `${task1Duration.toFixed(2)}ms`,
      task2: `${task2Duration.toFixed(2)}ms`,
      task3: `${task3Duration.toFixed(2)}ms`,
      total: `${totalDuration.toFixed(2)}ms`
    }
  };
}

async function performTask1() {
  return new Promise(resolve => setTimeout(resolve, 30));
}

async function performTask2() {
  return new Promise(resolve => setTimeout(resolve, 50));
}

async function performTask3() {
  return new Promise(resolve => setTimeout(resolve, 20));
}
```

### Event Loop Timing

```javascript
export async function handler(event) {
  const results = [];
  
  // Immediate execution
  results.push('1: Synchronous');
  
  // Next tick (before I/O)
  process.nextTick(() => {
    results.push('2: Next tick');
  });
  
  // Promise (microtask)
  Promise.resolve().then(() => {
    results.push('3: Promise microtask');
  });
  
  // setTimeout (macrotask)
  setTimeout(() => {
    results.push('4: setTimeout');
  }, 0);
  
  // Wait for event loop to process
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return { results };
}
```

### Validating Required Environment Variables

```javascript
export async function handler(event) {
  const required = [
    'DATABASE_URL',
    'API_KEY',
    'SECRET_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // All required variables present
  return {
    status: 'configured',
    environment: process.env.NODE_ENV || 'development'
  };
}
```

### Feature Flags from Environment

```javascript
export async function handler(event) {
  // Define feature flags
  const features = {
    newUI: process.env.FEATURE_NEW_UI === 'true',
    betaAPI: process.env.FEATURE_BETA_API === 'true',
    analytics: process.env.FEATURE_ANALYTICS !== 'false', // default true
    debugMode: process.env.DEBUG === 'true'
  };
  
  // Use feature flags
  let response = { status: 'ok' };
  
  if (features.newUI) {
    response.ui = 'v2';
  }
  
  if (features.betaAPI) {
    response.apiVersion = 'v2-beta';
  }
  
  if (features.analytics) {
    // Track event
    console.log('Analytics event tracked');
  }
  
  if (features.debugMode) {
    response.debug = {
      timestamp: Date.now(),
      pid: process.pid,
      uptime: process.uptime()
    };
  }
  
  return response;
}
```

## Best Practices

- Use environment variables for configuration instead of hardcoding values
- Validate required environment variables at function startup
- Use `process.hrtime.bigint()` for accurate performance measurements
- Remember that `process.env` is read-only in Invoke functions
- Use `process.nextTick()` sparingly and understand its timing
- Don't attempt to use restricted methods like `process.exit()`

## Next Steps

- [Console logging](./console.md)
- [Timers and scheduling](./timers.md)
- [Working with utilities](./util.md)
- [Environment Variables Guide](/docs/guides/environment-vars)

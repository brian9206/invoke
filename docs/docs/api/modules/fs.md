# fs

The `fs` module provides file system operations for reading, writing, and manipulating files and directories. It supports three API styles: synchronous, asynchronous callback-based, and promise-based.

## Import

```javascript
const fs = require('fs');
// For callback-based async API

const fs = require('fs').promises;
// For promise-based API

const { readFileSync, writeFileSync } = require('fs');
// For synchronous API
```

## API Styles

### 1. Synchronous Methods
Blocking operations that return results directly. Method names end with `Sync`.

### 2. Asynchronous Callback-based Methods  
Non-blocking operations that use callbacks. These are the standard methods without `Sync` suffix.

### 3. Promise-based API (fs.promises)
Non-blocking operations that return Promises. Available via `require('fs').promises` or `require('fs/promises')`.

## API Reference

### Reading Files

#### fs.readFile(path[, options], callback)
#### fs.readFileSync(path[, options])
#### fsPromises.readFile(path[, options])

Reads the entire contents of a file.

**Options:**
- `encoding` - Character encoding (default: null, returns Buffer)
- `flag` - File system flag (default: 'r')

### Writing Files

#### fs.writeFile(file, data[, options], callback)
#### fs.writeFileSync(file, data[, options])
#### fsPromises.writeFile(file, data[, options])

Writes data to a file, replacing the file if it already exists.

### Appending to Files

#### fs.appendFile(path, data[, options], callback)
#### fs.appendFileSync(path, data[, options])
#### fsPromises.appendFile(path, data[, options])

Appends data to a file, creating the file if it does not exist.

### File Information

#### fs.stat(path[, options], callback)
#### fs.statSync(path[, options])
#### fsPromises.stat(path[, options])

Returns file/directory statistics.

### File Operations

#### fs.unlink(path, callback)
#### fs.unlinkSync(path)
#### fsPromises.unlink(path)

Deletes a file.

#### fs.rename(oldPath, newPath, callback)
#### fs.renameSync(oldPath, newPath)
#### fsPromises.rename(oldPath, newPath)

Renames or moves a file.

#### fs.copyFile(src, dest[, mode], callback)
#### fs.copyFileSync(src, dest[, mode])
#### fsPromises.copyFile(src, dest[, mode])

Copies a file.

### Directory Operations

#### fs.mkdir(path[, options], callback)
#### fs.mkdirSync(path[, options])
#### fsPromises.mkdir(path[, options])

Creates a directory.

**Options:**
- `recursive` - Create parent directories if needed (default: false)
- `mode` - Directory permissions (default: 0o777)

#### fs.readdir(path[, options], callback)
#### fs.readdirSync(path[, options])
#### fsPromises.readdir(path[, options])

Reads the contents of a directory.

#### fs.rmdir(path[, options], callback)
#### fs.rmdirSync(path[, options])
#### fsPromises.rmdir(path[, options])

Removes a directory.

#### fs.rm(path[, options], callback)
#### fs.rmSync(path[, options])
#### fsPromises.rm(path[, options])

Removes files and directories (more flexible than rmdir).

### File Existence

#### fs.access(path[, mode], callback)
#### fs.accessSync(path[, mode])
#### fsPromises.access(path[, mode])

Tests file/directory accessibility and permissions.

#### fs.exists(path, callback) [Deprecated]

Use `fs.access()` instead.

### File Watching

#### fs.watch(filename[, options][, listener])

Watches for changes on a file or directory.

#### fs.watchFile(filename[, options], listener)

Watches for changes on a file.

### Stream APIs

#### fs.createReadStream(path[, options])

Creates a readable stream.

#### fs.createWriteStream(path[, options])

Creates a writable stream.

## Examples

### Reading Files (All Three Styles)

```javascript
const fs = require('fs');
const fsPromises = require('fs').promises;

export async function handler(event) {
  const filePath = '/tmp/test.txt';
  
  // Create test file
  fs.writeFileSync(filePath, 'Hello, World!');
  
  // 1. Synchronous
  const contentSync = fs.readFileSync(filePath, 'utf8');
  
  // 2. Callback-based  
  const contentCallback = await new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  
  // 3. Promise-based
  const contentPromise = await fsPromises.readFile(filePath, 'utf8');
  
  return {
    sync: contentSync,
    callback: contentCallback,
    promise: contentPromise,
    allMatch: contentSync === contentCallback && contentCallback === contentPromise
  };
}
```

### Writing Files (All Three Styles)

```javascript
const fs = require('fs');
const fsPromises = require('fs').promises;

export async function handler(event) {
  const content = event.content || 'File content';
  
  // 1. Synchronous
  fs.writeFileSync('/tmp/sync.txt', content, 'utf8');
  
  // 2. Callback-based
  await new Promise((resolve, reject) => {
    fs.writeFile('/tmp/callback.txt', content, 'utf8', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // 3. Promise-based
  await fsPromises.writeFile('/tmp/promise.txt', content, 'utf8');
  
  // Verify
  const sync = fs.readFileSync('/tmp/sync.txt', 'utf8');
  const callback = fs.readFileSync('/tmp/callback.txt', 'utf8');
  const promise = fs.readFileSync('/tmp/promise.txt', 'utf8');
  
  return {
    allWritten: sync === content && callback === content && promise === content
  };
}
```

### Working with JSON Files

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const filePath = '/tmp/data.json';
  
  // Write JSON
  const data = {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' }
    ],
    timestamp: new Date().toISOString()
  };
  
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  
  // Read JSON
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  
  return {
    written: data,
    read: parsed,
    match: JSON.stringify(data) === JSON.stringify(parsed)
  };
}
```

### Directory Operations

```javascript
const fs = require('fs').promises;
const path = require('path');

export async function handler(event) {
  const baseDir = '/tmp/myapp';
  const subDir = path.join(baseDir, 'data', 'users');
  
  // Create nested directories
  await fs.mkdir(subDir, { recursive: true });
  
  // Create some files
  await fs.writeFile(path.join(subDir, 'user1.json'), '{"name":"Alice"}');
  await fs.writeFile(path.join(subDir, 'user2.json'), '{"name":"Bob"}');
  await fs.writeFile(path.join(baseDir, 'config.json'), '{"version":"1.0"}');
  
  // List directory contents
  const files = await fs.readdir(subDir);
  const allFiles = await fs.readdir(baseDir, { recursive: true });
  
  // Get file stats
  const stats = await fs.stat(subDir);
  
  return {
    created: subDir,
    files,
    allFiles,
    isDirectory: stats.isDirectory()
  };
}
```

### File Statistics and Metadata

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const filePath = '/tmp/document.txt';
  
  // Create file
  await fs.writeFile(filePath, 'Sample content');
  
  // Get stats
  const stats = await fs.stat(filePath);
  
  return {
    size: stats.size,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    mode: stats.mode.toString(8),
    permissions: stats.mode & 0o777
  };
}
```

### Copying and Moving Files

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const source = '/tmp/source.txt';
  const copyDest = '/tmp/copy.txt';
  const moveDest = '/tmp/moved.txt';
  
  // Create source file
  await fs.writeFile(source, 'Original content');
  
  // Copy file
  await fs.copyFile(source, copyDest);
  
  // Move file (rename)
  await fs.rename(source, moveDest);
  
  // Verify
  const copyContent = await fs.readFile(copyDest, 'utf8');
  const moveContent = await fs.readFile(moveDest, 'utf8');
  
  // Check if source still exists
  let sourceExists = false;
  try {
    await fs.access(source);
    sourceExists = true;
  } catch (err) {
    sourceExists = false;
  }
  
  return {
    copyContent,
    moveContent,
    sourceExists,
    contentsMatch: copyContent === moveContent
  };
}
```

### Appending to Files

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const logFile = '/tmp/app.log';
  
  // Initial write
  await fs.writeFile(logFile, 'Log started\n');
  
  // Append entries
  await fs.appendFile(logFile, `[${new Date().toISOString()}] User logged in\n`);
  await fs.appendFile(logFile, `[${new Date().toISOString()}] Action performed\n`);
  await fs.appendFile(logFile, `[${new Date().toISOString()}] User logged out\n`);
  
  // Read full log
  const log = await fs.readFile(logFile, 'utf8');
  
  return {
    log,
    lines: log.split('\n').filter(line => line.length > 0).length
  };
}
```

### Checking File Existence

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const existingFile = '/tmp/exists.txt';
  const missingFile = '/tmp/missing.txt';
  
  // Create one file
  await fs.writeFile(existingFile, 'Content');
  
  // Check existence using access
  async function fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  const exists1 = await fileExists(existingFile);
  const exists2 = await fileExists(missingFile);
  
  return {
    existingFile: exists1,
    missingFile: exists2
  };
}
```

### Reading Directories Recursively

```javascript
const fs = require('fs').promises;
const path = require('path');

export async function handler(event) {
  const rootDir = '/tmp/project';
  
  // Create directory structure
  await fs.mkdir(path.join(rootDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'tests'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'README.md'), '# Project');
  await fs.writeFile(path.join(rootDir, 'src', 'index.js'), 'console.log("hi")');
  await fs.writeFile(path.join(rootDir, 'tests', 'test.js'), 'test()');
  
  // Read recursively
  async function getAllFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  const allFiles = await getAllFiles(rootDir);
  
  return {
    rootDir,
    files: allFiles.map(f => path.relative(rootDir, f))
  };
}
```

### Stream Reading for Large Files

```javascript
const fs = require('fs');

export async function handler(event) {
  const filePath = '/tmp/large-file.txt';
  
  // Create large file
  const lines = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}`);
  fs.writeFileSync(filePath, lines.join('\n'));
  
  // Stream read
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let lineCount = 0;
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line
      lineCount += lines.length;
    });
    
    stream.on('end', () => {
      if (buffer) lineCount++; // Count last line
      resolve({
        filePath,
        lineCount,
        fileSize: fs.statSync(filePath).size
      });
    });
    
    stream.on('error', reject);
  });
}
```

### Stream Writing

```javascript
const fs = require('fs');

export async function handler(event) {
  const filePath = '/tmp/output.txt';
  
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    
    // Write data in chunks
    for (let i = 0; i < 1000; i++) {
      stream.write(`Line ${i + 1}\n`);
    }
    
    stream.end();
    
    stream.on('finish', () => {
      const stats = fs.statSync(filePath);
      resolve({
        filePath,
        bytesWritten: stats.size,
        lines: 1000
      });
    });
    
    stream.on('error', reject);
  });
}
```

### Deleting Files and Directories

```javascript
const fs = require('fs').promises;
const path = require('path');

export async function handler(event) {
  const testDir = '/tmp/to-delete';
  
  // Create structure
  await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
  await fs.writeFile(path.join(testDir, 'subdir', 'file2.txt'), 'content');
  
  // Delete individual file
  await fs.unlink(path.join(testDir, 'file1.txt'));
  
  // Delete directory recursively
  await fs.rm(testDir, { recursive: true, force: true });
  
  // Verify deletion
  let exists = false;
  try {
    await fs.access(testDir);
    exists = true;
  } catch {
    exists = false;
  }
  
  return {
    deleted: !exists,
    message: 'Directory and contents deleted'
  };
}
```

### Binary File Operations

```javascript
const fs = require('fs').promises;

export async function handler(event) {
  const filePath = '/tmp/binary-data.bin';
  
  // Create binary data
  const buffer = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) {
    buffer[i] = i;
  }
  
  // Write binary file
  await fs.writeFile(filePath, buffer);
  
  // Read binary file
  const readBuffer = await fs.readFile(filePath);
  
  // Compare
  const match = buffer.equals(readBuffer);
  
  return {
    written: buffer.length,
    read: readBuffer.length,
    match,
    first10Bytes: Array.from(readBuffer.slice(0, 10))
  };
}
```

### Temporary File Operations

```javascript
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

export async function handler(event) {
  // Generate unique temp filename
  const tempFileName = `temp-${crypto.randomBytes(8).toString('hex')}.txt`;
  const tempPath = path.join('/tmp', tempFileName);
  
  try {
    // Create and use temp file
    await fs.writeFile(tempPath, 'Temporary data');
    
    const content = await fs.readFile(tempPath, 'utf8');
    
    return {
      tempFile: tempFileName,
      content
    };
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
```

## Best Practices

- **Prefer promise-based API** - Use `fs.promises` for cleaner async code
- **Avoid synchronous methods in production** - They block the event loop
- **Use streams for large files** - More memory efficient than reading entire file
- **Always handle errors** - File operations can fail for many reasons
- **Use path.join()** - For cross-platform path construction
- **Close file handles** - Especially when using file descriptors
- **Check file existence with access()** - Not the deprecated `exists()`
- **Use appropriate file flags** - 'wx' to avoid overwriting existing files

## File System Flags

- `'r'` - Read (default)
- `'w'` - Write (truncates existing file)
- `'a'` - Append
- `'x'` - Exclusive (fails if file exists)
- `'r+'` - Read and write
- `'w+'` - Read and write (truncates)
- `'a+'` - Read and append
- `'wx'` - Write exclusive

## Next Steps

- [Path utilities](./path.md)
- [Stream processing](./stream.md)
- [Buffer operations](./buffer.md)
- [Working with archives](./zlib.md)

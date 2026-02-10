# path

The `path` module provides utilities for working with file and directory paths. It handles platform-specific path differences automatically.

## Import

```javascript
const path = require('path');
```

## API Reference

### path.basename(path[, ext])

Returns the last portion of a path, similar to the Unix basename command.

**Parameters:**
- `path` - The file path
- `ext` (optional) - File extension to remove

### path.dirname(path)

Returns the directory name of a path, similar to the Unix dirname command.

### path.extname(path)

Returns the extension of the path, from the last occurrence of the `.` character to end of string.

### path.join([...paths])

Joins all given path segments together using the platform-specific separator, then normalizes the resulting path.

### path.resolve([...paths])

Resolves a sequence of paths or path segments into an absolute path.

### path.relative(from, to)

Returns the relative path from `from` to `to`.

### path.normalize(path)

Normalizes the given path, resolving `'..'` and `'.'` segments.

### path.parse(path)

Returns an object with properties representing significant elements of the path.

**Returns:**
- `root` - Root of the path
- `dir` - Directory name
- `base` - File name including extension
- `ext` - File extension
- `name` - File name without extension

### path.format(pathObject)

Returns a path string from an object (opposite of `path.parse()`).

### path.isAbsolute(path)

Determines if path is an absolute path.

### path.sep

Provides the platform-specific path segment separator (`\\` on Windows, `/` on POSIX).

### path.delimiter

Provides the platform-specific path delimiter (`;` on Windows, `:` on POSIX).

### path.posix

Provides access to POSIX-specific implementations of path methods.

### path.win32

Provides access to Windows-specific implementations of path methods.

## Examples

### Basic Path Operations

```javascript
const path = require('path');

export async function handler(event) {
  const filePath = '/users/alice/documents/report.pdf';
  
  return {
    basename: path.basename(filePath),          // 'report.pdf'
    basenameNoExt: path.basename(filePath, '.pdf'), // 'report'
    dirname: path.dirname(filePath),            // '/users/alice/documents'
    extname: path.extname(filePath),            // '.pdf'
    isAbsolute: path.isAbsolute(filePath)       // true
  };
}
```

### Joining Paths

```javascript
const path = require('path');

export async function handler(event) {
  const baseDir = '/home/user';
  const subDir = 'projects';
  const fileName = 'app.js';
  
  // Join path segments
  const fullPath = path.join(baseDir, subDir, fileName);
  // Result: '/home/user/projects/app.js'
  
  // Handles extra slashes and resolves '..'
  const normalized = path.join('/foo/', '/bar', 'baz/asdf', '..', 'quux');
  // Result: '/foo/bar/baz/quux'
  
  return {
    fullPath,
    normalized
  };
}
```

### Resolving Absolute Paths

```javascript
const path = require('path');

export async function handler(event) {
  // Resolve to absolute path
  const absolute1 = path.resolve('app.js');
  // Result: '/current/working/directory/app.js'
  
  const absolute2 = path.resolve('/foo/bar', './baz');
  // Result: '/foo/bar/baz'
  
  const absolute3 = path.resolve('/foo/bar', '/tmp/file/');
  // Result: '/tmp/file' (absolute path on right resets)
  
  return {
    absolute1,
    absolute2,
    absolute3
  };
}
```

### Parsing and Formatting Paths

```javascript
const path = require('path');

export async function handler(event) {
  const filePath = '/home/user/documents/report.pdf';
  
  // Parse path into components
  const parsed = path.parse(filePath);
  /*
  {
    root: '/',
    dir: '/home/user/documents',
    base: 'report.pdf',
    ext: '.pdf',
    name: 'report'
  }
  */
  
  // Modify and format back
  const modified = path.format({
    root: parsed.root,
    dir: parsed.dir,
    base: 'summary.txt'
  });
  // Result: '/home/user/documents/summary.txt'
  
  return {
    parsed,
    modified
  };
}
```

### Relative Paths

```javascript
const path = require('path');

export async function handler(event) {
  const from = '/data/users/alice';
  const to = '/data/projects/myapp';
  
  // Get relative path from 'from' to 'to'
  const relative = path.relative(from, to);
  // Result: '../../projects/myapp'
  
  const from2 = '/home/user/docs';
  const to2 = '/home/user/docs/reports/2024/january.pdf';
  const relative2 = path.relative(from2, to2);
  // Result: 'reports/2024/january.pdf'
  
  return {
    relative,
    relative2
  };
}
```

### Normalizing Paths

```javascript
const path = require('path');

export async function handler(event) {
  // Remove redundant segments
  const normalized1 = path.normalize('/foo/bar//baz/asdf/quux/..');
  // Result: '/foo/bar/baz/asdf'
  
  const normalized2 = path.normalize('./foo/./bar/./baz');
  // Result: 'foo/bar/baz'
  
  const normalized3 = path.normalize('../user/docs');
  // Result: '../user/docs'
  
  return {
    normalized1,
    normalized2,
    normalized3
  };
}
```

### Working with File Extensions

```javascript
const path = require('path');

export async function handler(event) {
  const files = [
    'document.pdf',
    'image.jpg',
    'archive.tar.gz',
    'script.min.js',
    'README'
  ];
  
  const analyzed = files.map(file => ({
    original: file,
    name: path.basename(file, path.extname(file)),
    ext: path.extname(file)
  }));
  
  return { files: analyzed };
}
```

### Cross-Platform Path Handling

```javascript
const path = require('path');

export async function handler(event) {
  // Platform-specific separator
  console.log('Path separator:', path.sep);
  // Windows: '\', POSIX: '/'
  
  // Platform-specific delimiter
  console.log('Path delimiter:', path.delimiter);
  // Windows: ';', POSIX: ':'
  
  // Force POSIX-style paths
  const posixPath = path.posix.join('/usr', 'local', 'bin');
  // Always: '/usr/local/bin'
  
  // Force Windows-style paths
  const winPath = path.win32.join('C:\\', 'Users', 'Alice');
  // Always: 'C:\\Users\\Alice'
  
  return {
    sep: path.sep,
    delimiter: path.delimiter,
    posixPath,
    winPath
  };
}
```

### Building File Paths

```javascript
const path = require('path');
const fs = require('fs').promises;

export async function handler(event) {
  const { category, filename } = event;
  
  // Build safe file path
  const baseDir = '/tmp/uploads';
  const categoryDir = path.join(baseDir, category);
  const filePath = path.join(categoryDir, filename);
  
  // Ensure we're still within baseDir (security check)
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  
  if (!resolved.startsWith(resolvedBase)) {
    throw new Error('Invalid path: directory traversal detected');
  }
  
  // Create directory if needed
  await fs.mkdir(categoryDir, { recursive: true });
  
  return {
    filePath: resolved,
    directory: categoryDir,
    filename: path.basename(resolved)
  };
}
```

### Parsing URLs vs File Paths

```javascript
const path = require('path');

export async function handler(event) {
  // File path parsing
  const filePath = '/projects/myapp/src/index.js';
  const fileInfo = {
    path: filePath,
    dir: path.dirname(filePath),
    file: path.basename(filePath),
    ext: path.extname(filePath)
  };
  
  // URL path parsing (use url module for full URLs)
  const urlPath = '/api/users/123/profile';
  const urlSegments = urlPath.split('/').filter(Boolean);
  
  return {
    fileInfo,
    urlPath,
    urlSegments
  };
}
```

### Finding Common Base Path

```javascript
const path = require('path');

export async function handler(event) {
  const paths = [
    '/home/user/projects/app1/src/index.js',
    '/home/user/projects/app1/src/utils.js',
    '/home/user/projects/app1/tests/test.js'
  ];
  
  // Find common directory
  function findCommonBase(paths) {
    if (paths.length === 0) return '';
    if (paths.length === 1) return path.dirname(paths[0]);
    
    const sorted = paths.slice().sort();
    const first = sorted[0].split(path.sep);
    const last = sorted[sorted.length - 1].split(path.sep);
    
    let i = 0;
    while (i < first.length && first[i] === last[i]) {
      i++;
    }
    
    return first.slice(0, i).join(path.sep);
  }
  
  const commonBase = findCommonBase(paths);
  
  return {
    paths,
    commonBase,
    relativePaths: paths.map(p => path.relative(commonBase, p))
  };
}
```

### Safe Filename Generation

```javascript
const path = require('path');

export async function handler(event) {
  const originalFilename = event.filename || 'my document (version 2).pdf';
  
  // Sanitize filename
  function sanitizeFilename(filename) {
    // Remove path separators and other unsafe characters
    return filename
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }
  
  const sanitized = sanitizeFilename(originalFilename);
  const parsed = path.parse(sanitized);
  
  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const uniqueFilename = `${parsed.name}_${timestamp}${parsed.ext}`;
  
  return {
    original: originalFilename,
    sanitized,
    unique: uniqueFilename
  };
}
```

## Best Practices

- Always use `path.join()` or `path.resolve()` instead of string concatenation
- Use `path.parse()` for complex path manipulations
- Validate paths with `path.resolve()` to prevent directory traversal attacks
- Use `path.posix` or `path.win32` explicitly when you need specific behavior
- Remember that `path.resolve()` always returns an absolute path

## Next Steps

- [File system operations with fs](./fs.md)
- [URL parsing and formatting](./url.md)
- [Working with streams](./stream.md)
- [Process and environment](./process.md)

# mime-types

The `mime-types` module provides utilities for working with MIME types, allowing you to look up MIME types based on file extensions and vice versa.

## Import

```javascript
const mime = require('mime-types');
```

## API Reference

### mime.lookup(path)

Lookup the MIME type for a file path or extension.

**Parameters:**
- `path` - File path or extension

**Returns:** MIME type string or `false` if not found

### mime.contentType(type)

Create a full Content-Type header value for a given MIME type or file extension.

**Parameters:**
- `type` - MIME type or file extension

**Returns:** Content-Type string or `false`

### mime.extension(type)

Get the default file extension for a MIME type.

**Parameters:**
- `type` - MIME type

**Returns:** Extension string (without dot) or `false`

### mime.charset(type)

Get the default charset for a MIME type.

**Parameters:**
- `type` - MIME type

**Returns:** Charset string or `false`

### mime.types

Object mapping extensions to MIME types.

### mime.extensions

Object mapping MIME types to extensions.

## Examples

### Lookup MIME Type by Extension

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const filename = event.filename || 'document.pdf';
  
  const mimeType = mime.lookup(filename);
  
  return {
    filename: filename,
    mimeType: mimeType,
    found: mimeType !== false
  };
}
```

### Get Extension from MIME Type

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const mimeType = event.mimeType || 'image/jpeg';
  
  const extension = mime.extension(mimeType);
  
  return {
    mimeType: mimeType,
    extension: extension,
    withDot: extension ? `.${extension}` : null
  };
}
```

### Create Content-Type Header

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const filename = event.filename || 'index.html';
  
  const contentType = mime.contentType(filename);
  
  return {
    filename: filename,
    contentType: contentType,
    mimeType: mime.lookup(filename),
    charset: mime.charset(mime.lookup(filename))
  };
}
```

### Determine Charset

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const mimeType = event.mimeType || 'text/html';
  
  const charset = mime.charset(mimeType);
  
  return {
    mimeType: mimeType,
    charset: charset,
    hasCharset: charset !== false,
    fullContentType: mime.contentType(mimeType)
  };
}
```

### Multiple File Type Detection

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const files = event.files || [
    'document.pdf',
    'image.png',
    'video.mp4',
    'audio.mp3',
    'data.json',
    'script.js',
    'style.css',
    'page.html'
  ];
  
  const results = files.map(file => ({
    filename: file,
    mimeType: mime.lookup(file),
    contentType: mime.contentType(file),
    extension: file.split('.').pop()
  }));
  
  return {
    totalFiles: files.length,
    results: results
  };
}
```

### File Upload Validation

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const filename = event.filename || 'upload.txt';
  const allowedTypes = event.allowedTypes || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf'
  ];
  
  const mimeType = mime.lookup(filename);
  const isAllowed = allowedTypes.includes(mimeType);
  
  return {
    filename: filename,
    detectedType: mimeType,
    isAllowed: isAllowed,
    allowedTypes: allowedTypes,
    message: isAllowed 
      ? 'File type is allowed' 
      : 'File type is not allowed'
  };
}
```

### Content-Type for HTTP Response

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const filename = event.filename || 'api-response.json';
  
  const contentType = mime.contentType(filename);
  
  // Simulate HTTP response headers
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache'
  };
  
  return {
    filename: filename,
    headers: headers,
    mimeType: mime.lookup(filename)
  };
}
```

### Categorize Files by Type

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const files = event.files || [
    'photo.jpg',
    'video.mp4',
    'document.pdf',
    'song.mp3',
    'data.json',
    'archive.zip'
  ];
  
  const categorized = {
    images: [],
    videos: [],
    audio: [],
    documents: [],
    data: [],
    other: []
  };
  
  files.forEach(file => {
    const mimeType = mime.lookup(file);
    
    if (mimeType) {
      if (mimeType.startsWith('image/')) {
        categorized.images.push(file);
      } else if (mimeType.startsWith('video/')) {
        categorized.videos.push(file);
      } else if (mimeType.startsWith('audio/')) {
        categorized.audio.push(file);
      } else if (mimeType === 'application/pdf' || 
                 mimeType.includes('document')) {
        categorized.documents.push(file);
      } else if (mimeType === 'application/json' || 
                 mimeType === 'application/xml') {
        categorized.data.push(file);
      } else {
        categorized.other.push(file);
      }
    } else {
      categorized.other.push(file);
    }
  });
  
  return {
    totalFiles: files.length,
    categories: categorized,
    summary: {
      images: categorized.images.length,
      videos: categorized.videos.length,
      audio: categorized.audio.length,
      documents: categorized.documents.length,
      data: categorized.data.length,
      other: categorized.other.length
    }
  };
}
```

### Check if Type is Text

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const filename = event.filename || 'document.txt';
  
  const mimeType = mime.lookup(filename);
  const charset = mime.charset(mimeType);
  
  // Text files usually have a charset
  const isText = charset !== false;
  
  return {
    filename: filename,
    mimeType: mimeType,
    charset: charset,
    isText: isText,
    isBinary: !isText
  };
}
```

### Generate Download Filename

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const contentType = event.contentType || 'application/pdf';
  const baseName = event.baseName || 'report';
  const timestamp = event.timestamp || Date.now();
  
  const extension = mime.extension(contentType);
  const filename = `${baseName}-${timestamp}.${extension}`;
  
  return {
    contentType: contentType,
    extension: extension,
    generatedFilename: filename,
    downloadHeaders: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  };
}
```

### MIME Type Database Query

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const searchExtension = event.extension || 'json';
  
  // Get MIME type for extension
  const mimeType = mime.types[searchExtension];
  
  // Get all extensions for this MIME type
  const allExtensions = mimeType ? mime.extensions[mimeType] : [];
  
  return {
    searchedExtension: searchExtension,
    mimeType: mimeType || 'not found',
    allExtensionsForType: allExtensions,
    contentType: mime.contentType(searchExtension)
  };
}
```

### Common MIME Types Reference

```javascript
const mime = require('mime-types');

export async function handler(event) {
  const commonTypes = {
    web: {
      html: mime.lookup('file.html'),
      css: mime.lookup('file.css'),
      javascript: mime.lookup('file.js'),
      json: mime.lookup('file.json'),
      xml: mime.lookup('file.xml')
    },
    images: {
      jpeg: mime.lookup('file.jpg'),
      png: mime.lookup('file.png'),
      gif: mime.lookup('file.gif'),
      svg: mime.lookup('file.svg'),
      webp: mime.lookup('file.webp')
    },
    documents: {
      pdf: mime.lookup('file.pdf'),
      word: mime.lookup('file.docx'),
      excel: mime.lookup('file.xlsx'),
      powerpoint: mime.lookup('file.pptx'),
      text: mime.lookup('file.txt')
    },
    media: {
      mp3: mime.lookup('file.mp3'),
      mp4: mime.lookup('file.mp4'),
      wav: mime.lookup('file.wav'),
      webm: mime.lookup('file.webm')
    },
    archives: {
      zip: mime.lookup('file.zip'),
      tar: mime.lookup('file.tar'),
      gzip: mime.lookup('file.gz'),
      rar: mime.lookup('file.rar')
    }
  };
  
  return commonTypes;
}
```

## Common MIME Types

| Extension | MIME Type | Description |
|-----------|-----------|-------------|
| .html | text/html | HTML document |
| .css | text/css | CSS stylesheet |
| .js | application/javascript | JavaScript |
| .json | application/json | JSON data |
| .xml | application/xml | XML document |
| .pdf | application/pdf | PDF document |
| .jpg | image/jpeg | JPEG image |
| .png | image/png | PNG image |
| .gif | image/gif | GIF image |
| .svg | image/svg+xml | SVG image |
| .mp3 | audio/mpeg | MP3 audio |
| .mp4 | video/mp4 | MP4 video |
| .zip | application/zip | ZIP archive |
| .txt | text/plain | Plain text |

## Best Practices

- **Use for file validation** - Verify uploaded file types
- **Set correct Content-Type** - Ensure proper browser handling
- **Check charset for text** - Include charset for text MIME types
- **Validate on both ends** - Check MIME type on client and server
- **Don't trust extensions** - File extension can be misleading
- **Use Content-Disposition** - Specify filename for downloads
- **Handle unknown types** - Provide fallback for unrecognized types

## Common Use Cases

- **File upload validation** - Check allowed file types
- **HTTP response headers** - Set Content-Type correctly
- **File categorization** - Group files by type
- **Download filename generation** - Create appropriate filenames
- **Content negotiation** - Serve correct content format
- **Static file serving** - Determine file MIME type

## Next Steps

- [HTTP module](./http.md)
- [HTTPS module](./https.md)
- [File system operations](./fs.md)
- [Path utilities](./path.md)

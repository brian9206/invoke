# http

The `http` module provides HTTP server and client functionality for making HTTP requests and creating HTTP servers.

## Import

```javascript
const http = require('http');
```

## API Reference

### http.request(options[, callback])
### http.request(url[, options][, callback])

Makes an HTTP request.

**Options:**
- `hostname` / `host` - Server hostname
- `port` - Server port (default: 80)
- `method` - HTTP method (default: 'GET')
- `path` - Request path (default: '/')
- `headers` - Request headers object
- `timeout` - Request timeout in milliseconds

**Returns:** `http.ClientRequest` instance

### http.get(options[, callback])
### http.get(url[, options][, callback])

Convenience method for GET requests. Similar to `http.request()` but automatically calls `req.end()`.

### Class: http.ClientRequest

Represents an in-progress HTTP request.

#### request.write(chunk[, encoding][, callback])

Sends a chunk of the request body.

#### request.end([data[, encoding]][, callback])

Finishes sending the request.

#### request.setTimeout(timeout[, callback])

Sets the request timeout.

#### request.abort()

Aborts the request.

### Class: http.IncomingMessage

Represents the response from an HTTP request or incoming request to an HTTP server.

#### message.statusCode

HTTP response status code.

#### message.statusMessage

HTTP response status message.

#### message.headers

Response headers object.

#### message.on('data', callback)

Event fired when response data is available.

#### message.on('end', callback)

Event fired when response is complete.

### http.createServer([options][, requestListener])

Creates an HTTP server.

### Class: http.Server

Represents an HTTP server.

#### server.listen(port[, hostname][, backlog

][, callback])

Starts the HTTP server listening for connections.

## Examples

### Basic GET Request

```javascript
const http = require('http');

export async function handler(event) {
  const url = event.url || 'http://httpbin.org/get';
  
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}
```

### GET Request with URL Object

```javascript
const http = require('http');
const { URL } = require('url');

export async function handler(event) {
  const urlObj = new URL('http://httpbin.org/user-agent');
  
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || 80,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Invoke-Function/1.0'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### POST Request with JSON

```javascript
const http = require('http');

export async function handler(event) {
  const postData = JSON.stringify({
    name: event.name || 'Alice',
    email: event.email || 'alice@example.com'
  });
  
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: '/post',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          response: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
```

### Request with Timeout

```javascript
const http = require('http');

export async function handler(event) {
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: '/delay/5', // 5 second delay
    method: 'GET',
    timeout: 2000 // 2 second timeout
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });
    
    req.on('timeout', () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Following Redirects

```javascript
const http = require('http');
const { URL } = require('url');

export async function handler(event) {
  async function httpGet(url, maxRedirects = 5) {
    if (maxRedirects <= 0) {
      throw new Error('Too many redirects');
    }
    
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url);
          return resolve(httpGet(redirectUrl.href, maxRedirects - 1));
        }
        
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            finalUrl: url,
            body: data
          });
        });
      }).on('error', reject);
    });
  }
  
  const result = await httpGet('http://httpbin.org/redirect/2');
  return result;
}
```

### Downloading Files

```javascript
const http = require('http');
const fs = require('fs');

export async function handler(event) {
  const url = 'http://httpbin.org/image/png';
  const outputPath = '/tmp/downloaded-image.png';
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: ${res.statusCode}`));
        return;
      }
      
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(outputPath);
        resolve({
          downloaded: outputPath,
          size: stats.size,
          contentType: res.headers['content-type']
        });
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}
```

### Making Multiple Requests

```javascript
const http = require('http');

export async function handler(event) {
  function httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            url,
            statusCode: res.statusCode,
            body: data
          });
        });
      }).on('error', reject);
    });
  }
  
  const urls = [
    'http://httpbin.org/uuid',
    'http://httpbin.org/user-agent',
    'http://httpbin.org/headers'
  ];
  
  const results = await Promise.all(urls.map(url => httpGet(url)));
  
  return {
    count: results.length,
    results: results.map(r => ({
      url: r.url,
      statusCode: r.statusCode,
      bodyLength: r.body.length
    }))
  };
}
```

### Custom Headers

```javascript
const http = require('http');

export async function handler(event) {
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: '/headers',
    method: 'GET',
    headers: {
      'User-Agent': 'Invoke-Function/1.0',
      'Accept': 'application/json',
      'X-Custom-Header': 'Custom Value',
      'Authorization': 'Bearer ' + (process.env.API_TOKEN || 'token')
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          response: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Error Handling

```javascript
const http = require('http');

export async function handler(event) {
  const url = event.url || 'http://invalid-domain-that-does-not-exist.com';
  
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          } else {
            resolve({
              statusCode: res.statusCode,
              body: data
            });
          }
        });
      });
      
      req.on('error', (err) => {
        reject(new Error(`Request failed: ${err.message}`));
      });
      
      req.on('timeout', () => {
        req.abort();
        reject(new Error('Request timeout'));
      });
      
      req.setTimeout(5000);
    });
    
    return {
      success: true,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Query Parameters

```javascript
const http = require('http');
const { URLSearchParams } = require('url');

export async function handler(event) {
  // Build query string
  const params = new URLSearchParams({
    search: event.query || 'nodejs',
    limit: event.limit || '10',
    page: event.page || '1'
  });
  
  const path = `/get?${params.toString()}`;
  
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: path,
    method: 'GET'
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          requestUrl: `http://httpbin.org${path}`,
          response: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Streaming Response Data

```javascript
const http = require('http');

export async function handler(event) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    
    http.get('http://httpbin.org/stream/5', (res) => {
      console.log('Status:', res.statusCode);
      console.log('Headers:', res.headers);
      
      res.on('data', (chunk) => {
        chunks.push(chunk.toString());
        totalBytes += chunk.length;
        console.log(`Received ${chunk.length} bytes`);
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          chunks: chunks.length,
          totalBytes,
          data: chunks.join('')
        });
      });
    }).on('error', reject);
  });
}
```

### Basic Authentication

```javascript
const http = require('http');

export async function handler(event) {
  const username = event.username || 'user';
  const password = event.password || 'pass';
  
  // Encode credentials
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: `/basic-auth/${username}/${password}`,
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          authenticated: res.statusCode === 200,
          response: data ? JSON.parse(data) : null
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Uploading Form Data

```javascript
const http = require('http');

export async function handler(event) {
  const formData = new URLSearchParams({
    name: event.name || 'Alice',
    email: event.email || 'alice@example.com',
    message: event.message || 'Hello from Invoke!'
  });
  
  const postData = formData.toString();
  
  const options = {
    hostname: 'httpbin.org',
    port: 80,
    path: '/post',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          response: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
```

## Best Practices

- **Use HTTPS module for secure requests** - Don't send sensitive data over HTTP
- **Always handle errors** - Network requests can fail
- **Set timeouts** - Prevent hanging requests
- **Close/end requests properly** - Call `req.end()` to finalize requests
- **Consider using higher-level libraries** - node-fetch or axios for more features
- **Handle redirects manually** - http module doesn't follow redirects automatically
- **Stream large responses** - Don't load everything into memory

## Common Status Codes

- `200` - OK
- `201` - Created
- `204` - No Content
- `301` - Moved Permanently
- `302` - Found (Temporary Redirect)
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable

## Next Steps

- [HTTPS requests](./https.md)
- [URL parsing](./url.md)
- [DNS resolution](./dns.md)
- [node-fetch module](./node-fetch.md)
- [Stream processing](./stream.md)

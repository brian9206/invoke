# https

The `https` module is the HTTP protocol extension for SSL/TLS-encrypted connections. It provides HTTPS server and client functionality with support for certificates and secure communication.

## Import

```javascript
const https = require('https');
```

## API Reference

The `https` module API is nearly identical to the `http` module, with the addition of SSL/TLS support.

### https.request(options[, callback])
### https.request(url[, options][, callback])

Makes an HTTPS request.

**Additional SSL/TLS Options:**
- `ca` - Certificate authority certificates
- `cert` - Client certificate
- `key` - Client private key
- `rejectUnauthorized` - Verify server certificate (default: true)
- `servername` - Server name for SNI (Server Name Indication)

### https.get(options[, callback])
### https.get(url[, options][, callback])

Convenience method for HTTPS GET requests.

### https.createServer(options[, requestListener])

Creates an HTTPS server.

**Options:**
- `key` - Private key in PEM format
- `cert` - Certificate in PEM format
- `ca` - Optional array of CA certificates

## Examples

### Basic HTTPS GET Request

```javascript
const https = require('https');

export async function handler(event) {
  const url = event.url || 'https://api.github.com/users/github';
  
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Invoke-Function'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data)
        });
      });
    }).on('error', reject);
  });
}
```

### HTTPS POST Request with JSON

```javascript
const https = require('https');

export async function handler(event) {
  const postData = JSON.stringify({
    title: event.title || 'Test Post',
    body: event.body || 'This is a test',
    userId: event.userId || 1
  });
  
  const options = {
    hostname: 'jsonplaceholder.typicode.com',
    port: 443,
    path: '/posts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
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

### HTTPS with Custom Headers and Bearer Token

```javascript
const https = require('https');

export async function handler(event) {
  const apiToken = process.env.API_TOKEN || 'your-token-here';
  
  const options = {
    hostname: 'api.example.com',
    port: 443,
    path: '/v1/user/profile',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
      'User-Agent': 'Invoke-Function/1.0'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data)
          });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}
```

### Ignore SSL Certificate Verification (Development Only)

```javascript
const https = require('https');

export async function handler(event) {
  // WARNING: Only use for development/testing with self-signed certificates
  // Never use in production!
  
  const options = {
    hostname: 'self-signed.badssl.com',
    port: 443,
    path: '/',
    method: 'GET',
    rejectUnauthorized: false // Disable certificate verification
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          warning: 'Certificate verification was disabled',
          bodyLength: data.length
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Downloading HTTPS Files

```javascript
const https = require('https');
const fs = require('fs');

export async function handler(event) {
  const url = 'https://httpbin.org/image/jpeg';
  const outputPath = '/tmp/downloaded-image.jpg';
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed: ${res.statusCode}`));
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

### Making Parallel HTTPS Requests

```javascript
const https = require('https');

export async function handler(event) {
  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });
  }
  
  // Fetch multiple resources in parallel
  const [users, posts, comments] = await Promise.all([
    fetchJson('https://jsonplaceholder.typicode.com/users/1'),
    fetchJson('https://jsonplaceholder.typicode.com/posts/1'),
    fetchJson('https://jsonplaceholder.typicode.com/comments/1')
  ]);
  
  return {
    user: users,
    post: posts,
    comment: comments
  };
}
```

### HTTPS with Retry Logic

```javascript
const https = require('https');

export async function handler(event) {
  async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
              data += chunk;
            });
            
            res.on('end', () => {
              if (res.statusCode === 200) {
                resolve({
                  statusCode: res.statusCode,
                  data: JSON.parse(data),
                  attempt
                });
              } else {
                reject(new Error(`HTTP ${res.statusCode}`));
              }
            });
          }).on('error', reject);
        });
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  const result = await fetchWithRetry('https://jsonplaceholder.typicode.com/users/1');
  
  return result;
}
```

### RESTful API Client

```javascript
const https = require('https');

class APIClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  
  async request(method, path, body = null) {
    const url = new URL(path, this.baseUrl);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        'User-Agent': 'Invoke-Function'
      }
    };
    
    if (body) {
      const postData = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          };
          
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(response);
          }
        });
      });
      
      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }
  
  async get(path) {
    return this.request('GET', path);
  }
  
  async post(path, body) {
    return this.request('POST', path, body);
  }
  
  async put(path, body) {
    return this.request('PUT', path, body);
  }
  
  async delete(path) {
    return this.request('DELETE', path);
  }
}

export async function handler(event) {
  const client = new APIClient(
    'https://jsonplaceholder.typicode.com',
    'fake-token'
  );
  
  const user = await client.get('/users/1');
  
  return {
    user: user.body
  };
}
```

### Checking Certificate Information

```javascript
const https = require('https');
const tls = require('tls');

export async function handler(event) {
  const hostname = event.hostname || 'github.com';
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      port: 443,
      path: '/',
      method: 'GET'
    };
    
    const req = https.request(options, (res) => {
      const cert = res.socket.getPeerCertificate();
      
      resolve({
        hostname,
        certificate: {
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint: cert.fingerprint,
          serialNumber: cert.serialNumber
        },
        authorized: res.socket.authorized,
        authorizationError: res.socket.authorizationError
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### HTTPS with Query Parameters

```javascript
const https = require('https');
const { URLSearchParams } = require('url');

export async function handler(event) {
  const params = new URLSearchParams({
    q: event.query || 'nodejs',
    limit: event.limit || 10,
    page: event.page || 1
  });
  
  const path = `/search?${params.toString()}`;
  
  const options = {
    hostname: 'api.example.com',
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'User-Agent': 'Invoke-Function'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          url: `https://api.example.com${path}`,
          bodyLength: data.length
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

### Following HTTPS Redirects

```javascript
const https = require('https');
const { URL } = require('url');

export async function handler(event) {
  async function fetchWithRedirects(url, maxRedirects = 5) {
    if (maxRedirects <= 0) {
      throw new Error('Too many redirects');
    }
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url);
          console.log(`Redirecting to: ${redirectUrl.href}`);
          return resolve(fetchWithRedirects(redirectUrl.href, maxRedirects - 1));
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
  
  const result = await fetchWithRedirects('https://httpbin.org/redirect/3');
  return result;
}
```

### HTTPS Request with Timeout

```javascript
const https = require('https');

export async function handler(event) {
  const timeoutMs = event.timeout || 5000;
  
  return new Promise((resolve, reject) => {
    const req = https.get('https://httpbin.org/delay/10', (res) => {
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
    
    req.on('error', reject);
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    
    req.setTimeout(timeoutMs);
  });
}
```

### PUT Request to Update Resource

```javascript
const https = require('https');

export async function handler(event) {
  const resourceId = event.id || 1;
  
  const putData = JSON.stringify({
    id: resourceId,
    title: 'Updated Title',
    body: 'Updated content',
    userId: 1
  });
  
  const options = {
    hostname: 'jsonplaceholder.typicode.com',
    port: 443,
    path: `/posts/${resourceId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(putData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          updated: JSON.parse(data)
        });
      });
    });
    
    req.on('error', reject);
    req.write(putData);
    req.end();
  });
}
```

### DELETE Request

```javascript
const https = require('https');

export async function handler(event) {
  const resourceId = event.id || 1;
  
  const options = {
    hostname: 'jsonplaceholder.typicode.com',
    port: 443,
    path: `/posts/${resourceId}`,
    method: 'DELETE'
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          deleted: res.statusCode === 200,
          response: data ? JSON.parse(data) : {}
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
```

## Best Practices

- **Always use HTTPS for sensitive data** - Never send passwords or tokens over HTTP
- **Handle certificate errors properly** - Don't disable certificate verification in production
- **Set reasonable timeouts** - Prevent hanging requests
- **Implement retry logic** - Handle transient failures
- **Use environment variables for tokens** - Never hardcode API keys
- **Validate SSL certificates** - Keep `rejectUnauthorized: true` (default)
- **Handle redirects appropriately** - Decide if you need to follow them
- **Consider using node-fetch** - Higher-level HTTP client with better API

## Common HTTPS Status Codes

Same as HTTP module:
- `200` - OK
- `201` - Created
- `401` - Unauthorized  
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Next Steps

- [HTTP requests](./http.md)
- [TLS/SSL operations](./tls.md)
- [node-fetch module](./node-fetch.md)
- [URL parsing](./url.md)
- [DNS resolution](./dns.md)

# node-fetch

The `node-fetch` module provides a light-weight implementation of the Fetch API for Node.js, making HTTP requests with a modern, promise-based interface.

## Import

```javascript
const fetch = require('node-fetch');
```

## API Reference

### fetch(url[, options])

Make an HTTP request.

**Parameters:**
- `url` - URL to fetch
- `options` - Request options object

**Returns:** Promise that resolves to Response object

**Options:**
- `method` - HTTP method (GET, POST, PUT, DELETE, etc.)
- `headers` - Request headers object
- `body` - Request body (string, Buffer, or stream)
- `redirect` - Redirect mode ('follow', 'error', 'manual')
- `signal` - AbortSignal for request cancellation
- `timeout` - Request timeout in milliseconds

### Class: Response

Represents the response to a request.

#### response.ok

`true` if status is 200-299.

#### response.status

HTTP status code.

#### response.statusText

HTTP status message.

#### response.headers

Response headers.

#### response.json()

Parse response body as JSON.

#### response.text()

Get response body as text.

#### response.buffer()

Get response body as Buffer.

#### response.arrayBuffer()

Get response body as ArrayBuffer.

### Class: Headers

Represents HTTP headers.

#### headers.get(name)

Get header value.

#### headers.set(name, value)

Set header value.

#### headers.append(name, value)

Append header value.

#### headers.delete(name)

Delete header.

## Examples

### Basic GET Request

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://api.github.com/users/github';
  
  const response = await fetch(url);
  const data = await response.json();
  
  return {
    status: response.status,
    ok: response.ok,
    data: data
  };
}
```

### POST Request with JSON

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://jsonplaceholder.typicode.com/posts';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: event.title || 'My Post',
      body: event.body || 'This is the content',
      userId: 1
    })
  });
  
  const data = await response.json();
  
  return {
    status: response.status,
    created: data
  };
}
```

### Custom Headers

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://api.github.com/user';
  const token = event.token || 'your-token-here';
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Invoke-Function'
    }
  });
  
  const data = await response.json();
  
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data: data
  };
}
```

### Error Handling

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://api.github.com/users/nonexistentuser12345';
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        error: true,
        status: response.status,
        statusText: response.statusText,
        message: `HTTP error: ${response.status}`
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    return {
      error: true,
      message: error.message,
      type: error.name
    };
  }
}
```

### Query Parameters

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const baseUrl = 'https://api.github.com/search/repositories';
  
  const params = new URLSearchParams({
    q: event.query || 'javascript',
    sort: 'stars',
    order: 'desc',
    per_page: event.limit || 5
  });
  
  const url = `${baseUrl}?${params}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return {
    totalCount: data.total_count,
    repositories: data.items.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      stars: repo.stargazers_count,
      url: repo.html_url
    }))
  };
}
```

### Request Timeout

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://httpbin.org/delay/5';
  const timeoutMs = event.timeout || 3000;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    const data = await response.json();
    
    return {
      success: true,
      status: response.status,
      data: data
    };
    
  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      return {
        error: true,
        message: `Request timeout after ${timeoutMs}ms`
      };
    }
    
    return {
      error: true,
      message: error.message
    };
  }
}
```

### Parallel Requests

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const users = event.users || ['github', 'microsoft', 'google'];
  
  const requests = users.map(user =>
    fetch(`https://api.github.com/users/${user}`)
      .then(res => res.json())
  );
  
  const results = await Promise.all(requests);
  
  return {
    count: results.length,
    users: results.map(user => ({
      login: user.login,
      name: user.name,
      publicRepos: user.public_repos,
      followers: user.followers
    }))
  };
}
```

### Response Headers

```javascript
const fetch = require('node-fetch');

export async function handler(event) {
  const url = event.url || 'https://api.github.com';
  
  const response = await fetch(url);
  
  return {
    status: response.status,
    statusText: response.statusText,
    headers: {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      server: response.headers.get('server'),
      date: response.headers.get('date'),
      rateLimit: response.headers.get('x-ratelimit-limit'),
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining')
    },
    allHeaders: Object.fromEntries(response.headers.entries())
  };
}
```

### File Upload (FormData)

```javascript
const fetch = require('node-fetch');
const FormData = require('form-data');

export async function handler(event) {
  const url = event.url || 'https://httpbin.org/post';
  
  const form = new FormData();
  form.append('name', 'test-file.txt');
  form.append('content', 'Hello, World!');
  form.append('metadata', JSON.stringify({
    type: 'text',
    size: 13
  }));
  
  const response = await fetch(url, {
    method: 'POST',
    body: form
  });
  
  const data = await response.json();
  
  return {
    status: response.status,
    uploaded: true,
    response: data
  };
}
```

### Retry Logic

```javascript
const fetch = require('node-fetch');

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }
      
      console.log(`Attempt ${i + 1} failed with status ${response.status}`);
      
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function handler(event) {
  const url = event.url || 'https://httpbin.org/status/500';
  
  try {
    const response = await fetchWithRetry(url, {}, 3);
    const data = await response.json();
    
    return {
      success: true,
      status: response.status,
      data: data
    };
    
  } catch (error) {
    return {
      error: true,
      message: error.message,
      note: 'Failed after 3 retries'
    };
  }
}
```

### REST API Client

```javascript
const fetch = require('node-fetch');

class APIClient {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  }
  
  async get(endpoint) {
    return this.request(endpoint);
  }
  
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
}

export async function handler(event) {
  const client = new APIClient(
    'https://api.github.com',
    'your-token-here'
  );
  
  const user = await client.get('/user');
  const repos = await client.get('/user/repos?per_page=5');
  
  return {
    user: {
      login: user.login,
      name: user.name
    },
    repoCount: repos.length
  };
}
```

## Best Practices

- **Check response.ok** - Always verify successful status codes
- **Handle errors properly** - Use try/catch for network errors
- **Set timeouts** - Prevent hanging requests
- **Use AbortController** - Cancel requests when needed
- **Parse responses correctly** - Use appropriate method (json, text, buffer)
- **Reuse connections** - Keep HTTP agents for connection pooling
- **Add retry logic** - Handle transient failures gracefully

## Common Use Cases

- **REST API consumption** - Call external APIs
- **Webhooks** - Send HTTP notifications
- **Data fetching** - Retrieve JSON data
- **File uploads** - Upload files via HTTP
- **Authentication** - Bearer tokens and API keys
- **Microservices communication** - Service-to-service calls

## Advantages Over http/https

- **Promise-based** - Modern async/await syntax
- **Simpler API** - More intuitive than native modules
- **Standard Fetch API** - Compatible with browser fetch
- **Less boilerplate** - Fewer lines of code
- **Better errors** - More informative error messages

## Next Steps

- [HTTP module](./http.md)
- [HTTPS module](./https.md)
- [URL parsing](./url.md)
- [Streams](./stream.md)

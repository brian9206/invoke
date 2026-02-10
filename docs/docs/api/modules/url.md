# url

The `url` module provides utilities for URL resolution and parsing. It supports both the legacy `url` API and the modern WHATWG URL API.

## Import

```javascript
const url = require('url');
// or for URL and URLSearchParams classes
const { URL, URLSearchParams } = require('url');
```

## API Reference

### Class: URL

The WHATWG URL API implementation.

#### new URL(input[, base])

Creates a new URL object.

**Parameters:**
- `input` - The URL string to parse
- `base` (optional) - The base URL to resolve against

#### url.href

Gets and sets the serialized URL.

#### url.protocol

Gets and sets the protocol portion of the URL.

#### url.hostname

Gets and sets the hostname portion of the URL.

#### url.port

Gets and sets the port portion of the URL.

#### url.pathname

Gets and sets the path portion of the URL.

#### url.search

Gets and sets the query string portion of the URL.

#### url.searchParams

Gets the URLSearchParams object representing the URL's query parameters.

#### url.hash

Gets and sets the fragment portion of the URL.

#### url.host

Gets and sets the host portion of the URL (hostname + port).

#### url.origin

Gets the read-only origin of the URL.

#### url.username

Gets and sets the username portion of the URL.

#### url.password

Gets and sets the password portion of the URL.

#### url.toString()

Returns the serialized URL as a string.

#### url.toJSON()

Returns the serialized URL as a string (same as toString).

### Class: URLSearchParams

Provides utilities for working with URL query strings.

#### new URLSearchParams([init])

Creates a new URLSearchParams object.

#### params.append(name, value)

Appends a new name-value pair to the query string.

#### params.delete(name)

Removes all name-value pairs whose name is `name`.

#### params.get(name)

Returns the first value associated with `name`.

#### params.getAll(name)

Returns all values associated with `name`.

#### params.has(name)

Returns true if there is at least one name-value pair whose name is `name`.

#### params.set(name, value)

Sets the value associated with `name` to `value`. If there are multiple values, removes the others.

#### params.sort()

Sorts all name-value pairs by name.

#### params.toString()

Returns the query string.

#### params.entries()

Returns an iterator over all name-value pairs.

#### params.keys()

Returns an iterator over all names.

#### params.values()

Returns an iterator over all values.

### Legacy API

#### url.parse(urlString[, parseQueryString[, slashesDenoteHost]])

Parses a URL string and returns a URL object (legacy API).

#### url.format(urlObject)

Formats a URL object into a URL string (legacy API).

## Examples

### Parsing URLs

```javascript
const { URL } = require('url');

export async function handler(event) {
  const urlString = 'https://user:pass@example.com:8080/path/page?query=value&foo=bar#section';
  
  const parsedUrl = new URL(urlString);
  
  return {
    href: parsedUrl.href,
    protocol: parsedUrl.protocol,      // 'https:'
    hostname: parsedUrl.hostname,      // 'example.com'
    port: parsedUrl.port,              // '8080'
    pathname: parsedUrl.pathname,      // '/path/page'
    search: parsedUrl.search,          // '?query=value&foo=bar'
    hash: parsedUrl.hash,              // '#section'
    host: parsedUrl.host,              // 'example.com:8080'
    origin: parsedUrl.origin,          // 'https://example.com:8080'
    username: parsedUrl.username,      // 'user'
    password: parsedUrl.password       // 'pass'
  };
}
```

### Constructing URLs

```javascript
const { URL } = require('url');

export async function handler(event) {
  // Create a new URL
  const url = new URL('https://api.example.com');
  url.pathname = '/v2/users';
  url.searchParams.append('limit', '10');
  url.searchParams.append('offset', '0');
  url.searchParams.append('sort', 'name');
  
  return {
    constructedUrl: url.toString()
    // Result: 'https://api.example.com/v2/users?limit=10&offset=0&sort=name'
  };
}
```

### Working with Query Parameters

```javascript
const { URL, URLSearchParams } = require('url');

export async function handler(event) {
  const url = new URL('https://example.com/search?q=nodejs&category=docs&page=2');
  
  // Access query parameters
  const query = url.searchParams.get('q');           // 'nodejs'
  const category = url.searchParams.get('category'); // 'docs'
  const page = url.searchParams.get('page');         // '2'
  
  // Modify query parameters
  url.searchParams.set('page', '3');
  url.searchParams.append('filter', 'recent');
  url.searchParams.delete('category');
  
  // Check if parameter exists
  const hasQuery = url.searchParams.has('q'); // true
  
  return {
    original: 'https://example.com/search?q=nodejs&category=docs&page=2',
    modified: url.toString(),
    query,
    category,
    page,
    hasQuery
  };
}
```

### Creating Query Strings

```javascript
const { URLSearchParams } = require('url');

export async function handler(event) {
  // From object
  const params1 = new URLSearchParams({
    name: 'Alice',
    age: '30',
    city: 'New York'
  });
  
  // From string
  const params2 = new URLSearchParams('foo=bar&baz=qux');
  
  // From array of pairs
  const params3 = new URLSearchParams([
    ['color', 'red'],
    ['size', 'large'],
    ['color', 'blue'] // Multiple values for same key
  ]);
  
  // Build programmatically
  const params4 = new URLSearchParams();
  params4.append('search', 'Node.js');
  params4.append('category', 'tutorials');
  params4.append('limit', '20');
  
  return {
    fromObject: params1.toString(),
    fromString: params2.toString(),
    fromArray: params3.toString(),
    programmatic: params4.toString()
  };
}
```

### Iterating Over Parameters

```javascript
const { URLSearchParams } = require('url');

export async function handler(event) {
  const params = new URLSearchParams('name=Alice&age=30&city=NYC&hobby=reading&hobby=cycling');
  
  // Get all values for a key
  const hobbies = params.getAll('hobby'); // ['reading', 'cycling']
  
  // Iterate over all parameters
  const entries = [];
  for (const [key, value] of params.entries()) {
    entries.push({ key, value });
  }
  
  // Get all keys
  const keys = Array.from(params.keys());
  
  // Get all values
  const values = Array.from(params.values());
  
  return {
    hobbies,
    entries,
    keys,
    values
  };
}
```

### Resolving Relative URLs

```javascript
const { URL } = require('url');

export async function handler(event) {
  const base = 'https://example.com/docs/api/';
  
  // Resolve relative URLs
  const url1 = new URL('users', base);
  // Result: 'https://example.com/docs/api/users'
  
  const url2 = new URL('./users', base);
  // Result: 'https://example.com/docs/api/users'
  
  const url3 = new URL('../v2/users', base);
  // Result: 'https://example.com/docs/v2/users'
  
  const url4 = new URL('/api/v3/users', base);
  // Result: 'https://example.com/api/v3/users'
  
  const url5 = new URL('https://other.com/path', base);
  // Result: 'https://other.com/path' (absolute URL ignores base)
  
  return {
    base,
    url1: url1.href,
    url2: url2.href,
    url3: url3.href,
    url4: url4.href,
    url5: url5.href
  };
}
```

### Building API URLs

```javascript
const { URL } = require('url');

export async function handler(event) {
  const { resource, id, filters } = event;
  
  // Build API URL
  const apiUrl = new URL(`https://api.example.com/v2/${resource}`);
  
  if (id) {
    apiUrl.pathname += `/${id}`;
  }
  
  // Add filters as query parameters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => apiUrl.searchParams.append(key, v));
      } else {
        apiUrl.searchParams.set(key, value);
      }
    });
  }
  
  return {
    url: apiUrl.toString()
  };
}

// Example usage:
// { resource: 'users', id: '123', filters: { status: 'active', role: ['admin', 'user'] } }
// Result: https://api.example.com/v2/users/123?status=active&role=admin&role=user
```

### Validating URLs

```javascript
const { URL } = require('url');

export async function handler(event) {
  function isValidUrl(urlString) {
    try {
      new URL(urlString);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  function isValidHttpUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }
  
  const urls = [
    'https://example.com',
    'http://localhost:3000',
    'ftp://files.example.com',
    'not a url',
    'javascript:alert(1)'
  ];
  
  const results = urls.map(url => ({
    url,
    isValid: isValidUrl(url),
    isValidHttp: isValidHttpUrl(url)
  }));
  
  return { results };
}
```

### Encoding and Decoding URL Components

```javascript
export async function handler(event) {
  const text = 'Hello World! @#$%';
  
  // Encode for URL component (query parameter or path segment)
  const encoded = encodeURIComponent(text);
  // Result: 'Hello%20World!%20%40%23%24%25'
  
  // Decode
  const decoded = decodeURIComponent(encoded);
  // Result: 'Hello World! @#$%'
  
  // Full URI encoding (rarely needed)
  const fullUri = 'https://example.com/path with spaces/';
  const encodedUri = encodeURI(fullUri);
  // Result: 'https://example.com/path%20with%20spaces/'
  
  return {
    original: text,
    encoded,
    decoded,
    fullUri,
    encodedUri
  };
}
```

### Parsing Query String

```javascript
const { URLSearchParams } = require('url');

export async function handler(event) {
  // Parse query string from request
  const queryString = event.queryString || 'search=nodejs&limit=10&tags=tutorial&tags=beginner';
  
  const params = new URLSearchParams(queryString);
  
  // Convert to plain object
  const queryObject = {};
  for (const [key, value] of params.entries()) {
    if (params.getAll(key).length > 1) {
      queryObject[key] = params.getAll(key);
    } else {
      queryObject[key] = value;
    }
  }
  
  return {
    queryString,
    parsed: queryObject
  };
}
```

### Modifying URL Parts

```javascript
const { URL } = require('url');

export async function handler(event) {
  const originalUrl = 'http://example.com/old/path?foo=bar#section1';
  
  const url = new URL(originalUrl);
  
  // Change to HTTPS
  url.protocol = 'https:';
  
  // Change hostname
  url.hostname = 'api.example.com';
  
  // Update path
  url.pathname = '/v2/users';
  
  // Update query parameters
  url.searchParams.set('limit', '20');
  url.searchParams.delete('foo');
  url.searchParams.append('sort', 'name');
  
  // Update hash
  url.hash = '#results';
  
  return {
    original: originalUrl,
    modified: url.toString()
  };
}
```

### Legacy URL API

```javascript
const url = require('url');

export async function handler(event) {
  const urlString = 'https://user:pass@example.com:8080/path?query=value#hash';
  
  // Legacy parse (deprecated, but still works)
  const parsed = url.parse(urlString, true);
  
  // Legacy format
  const formatted = url.format({
    protocol: 'https:',
    hostname: 'example.com',
    pathname: '/api/users',
    query: { limit: 10, offset: 0 }
  });
  
  return {
    parsed: {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      query: parsed.query,
      hash: parsed.hash
    },
    formatted
  };
}
```

### Sorting Query Parameters

```javascript
const { URLSearchParams } = require('url');

export async function handler(event) {
  const params = new URLSearchParams('z=last&a=first&m=middle');
  
  console.log('Before sort:', params.toString());
  // z=last&a=first&m=middle
  
  params.sort();
  
  console.log('After sort:', params.toString());
  // a=first&m=middle&z=last
  
  return {
    beforeSort: 'z=last&a=first&m=middle',
    afterSort: params.toString()
  };
}
```

## Best Practices

- Use the modern WHATWG URL API (new URL()) instead of url.parse()
- Always validate URLs before parsing, especially user input
- Use `encodeURIComponent()` for query parameter values
- Remember that `url.searchParams` returns a URLSearchParams object, not a plain object
- Handle URL parsing errors with try-catch blocks
- Be careful with credentials in URLs - avoid logging full URLs that contain passwords

## Next Steps

- [HTTP requests](./http.md)
- [HTTPS requests](./https.md)
- [DNS resolution](./dns.md)
- [Query string utilities](./util.md)

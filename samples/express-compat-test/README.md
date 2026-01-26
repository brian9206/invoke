# Express.js Compatibility Test Function

Comprehensive test suite for validating Express.js req/res API compatibility in the Invoke serverless platform.

## Features Tested

### Request Object (`req`)
- ✅ `req.cookies` - Cookie parsing from Cookie header
- ✅ `req.is(type)` - Content-Type matching with wildcards
- ✅ `req.accepts(types)` - Accept header negotiation with q-values
- ✅ `req.param(name, default)` - Parameter resolution (params → query → body)
- ✅ `req.xhr` - AJAX request detection
- ✅ `req.baseUrl` - Base URL path
- ✅ `req.subdomains` - Subdomain extraction from hostname

### Response Object (`res`)
- ✅ `res.send(data)` - Smart sending (undefined, null, number, boolean, string, Buffer, array, object)
- ✅ `res.sendStatus(code)` - Quick status responses with message
- ✅ `res.json(data)` - JSON responses with charset
- ✅ `res.sendFile(path, options, callback)` - File serving with security
- ✅ `res.download(path, filename, options, callback)` - File downloads
- ✅ `res.redirect([status,] url)` - HTTP redirects with 'back' support
- ✅ `res.type(type)` - Set Content-Type with mime-types
- ✅ `res.cookie(name, value, options)` - Set cookies (maxAge, httpOnly, secure, sameSite)
- ✅ `res.clearCookie(name, options)` - Clear cookies
- ✅ `res.append(field, value)` - Append header values
- ✅ `res.location(url)` - Set Location header
- ✅ `res.render()` - Throws error (not supported)

## Usage

### Deploy the Function
Upload this function to your Invoke platform.

### Access the Test Menu
Navigate to the function's URL to see an interactive test menu:
```
GET /
```

### Run Individual Tests
Each test route demonstrates a specific feature:

**Request Tests:**
```bash
# Cookie parsing
curl -H "Cookie: session=abc123; user=john" http://your-function/req/cookies

# Content-Type matching
curl -H "Content-Type: application/json" http://your-function/req/is

# Accept header negotiation
curl -H "Accept: text/html,application/json;q=0.9" http://your-function/req/accepts

# Parameter resolution
curl http://your-function/req/param/123?name=test

# AJAX detection
curl -H "X-Requested-With: XMLHttpRequest" http://your-function/req/xhr

# Request info
curl http://your-function/req/info
```

**Response Tests:**
```bash
# Different data types
curl http://your-function/res/send-types?type=number
curl http://your-function/res/send-types?type=boolean
curl http://your-function/res/send-types?type=array
curl http://your-function/res/send-types?type=undefined

# Status responses
curl http://your-function/res/sendstatus/404
curl http://your-function/res/sendstatus/200

# JSON response
curl http://your-function/res/json

# File serving
curl http://your-function/res/sendfile?file=package.json

# File download
curl -O http://your-function/res/download?file=package.json&name=test.json

# Redirect
curl -I http://your-function/res/redirect?to=/&status=301

# Content-Type
curl -I http://your-function/res/type?type=json
curl -I http://your-function/res/type?type=html

# Cookies
curl -I http://your-function/res/cookie
curl -I http://your-function/res/clearcookie

# Headers
curl -I http://your-function/res/headers

# Render (error)
curl http://your-function/res/render
```

## Test Results

Each test endpoint returns a JSON response with:
- `test` - Name of the test
- `success` - Whether the test passed
- `note` - Additional information about the test
- Additional test-specific data

## Notes

- Some tests require specific HTTP headers (Cookie, Accept, Content-Type, X-Requested-With)
- File serving tests use files from the function's package directory
- Use browser DevTools or curl with `-I` flag to inspect response headers
- Cookie tests show Set-Cookie headers with various options
- The test menu provides an interactive HTML interface when accessed via browser

## Example Test Flow

1. **Start with the menu**: Visit `/` in a browser to see all available tests
2. **Click test links**: Each link runs a specific test
3. **Inspect responses**: Use browser DevTools Network tab to see headers
4. **Use curl for headers**: Run `curl -I <url>` to see response headers
5. **Test with different inputs**: Add query parameters to customize tests

## Implementation

This test function demonstrates real-world Express.js patterns:
- Cookie-based authentication flows
- Content negotiation for APIs
- File downloads and serving static files
- HTTP redirects for navigation
- Error handling with proper status codes

All features match Express.js behavior including:
- Argument overloading
- Error callbacks
- Header manipulation
- MIME type resolution
- Security features (path traversal prevention)

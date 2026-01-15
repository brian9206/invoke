# Example Modular Function

This is a demonstration function showing how to use local file imports in the Invoke platform.

## Structure

- `index.js` - Main entry point
- `utils.js` - Utility functions for data processing
- `lib/helper.js` - Response formatting helpers
- `lib/database.js` - Mock database operations
- `config/settings.js` - Configuration settings

## Features

- **Local file imports** using `require('./utils')`, `require('./lib/helper')`, etc.
- **Nested directory support** for organized code structure
- **Async/await support** for asynchronous operations
- **Built-in module access** for crypto, path, etc.
- **Error handling** with proper HTTP status codes
- **Console logging** for debugging

## Usage

The function accepts both GET and POST requests:

### GET Request
```bash
curl "http://localhost:3001/invoke/FUNCTION_ID?message=Hello&user=John"
```

### POST Request
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from POST", "user": "Jane"}' \
  "http://localhost:3001/invoke/FUNCTION_ID"
```

## Response Format

```json
{
  "success": true,
  "data": {
    "message": "Hello from modular function!",
    "processed_at": 1704067200000,
    "hash": "abc123...",
    "type": "object",
    "size": 45
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "1.2.0",
    "environment": "development",
    "request_id": "req_1704067200000_xyz789"
  },
  "statistics": {
    "total_users": 150,
    "total_requests": 2847,
    "uptime_since": "2023-12-31T00:00:00.000Z",
    "error_count": 12,
    "database_version": "2.1.0",
    "connection_pool": {
      "active": 5,
      "idle": 3,
      "max": 10
    }
  }
}
```

## Packaging

To create a deployable package:

```bash
# Navigate to the example-module directory
cd example-module

# Create tar.gz archive
tar -czf example-modular-function.tgz *
```

Then upload the `.tgz` file through the Invoke admin panel.
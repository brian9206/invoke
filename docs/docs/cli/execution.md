---
sidebar_position: 6
---

# Function Execution

Execute and test your functions directly from the CLI.

:::tip Running functions locally
Use [`invoke run`](./local-run) to execute a function on your machine without a running execution service — same isolated-vm sandbox, no network connection required.
:::

## Invoking Functions

### Basic Invocation

Invoke a function using its name or ID:

```bash
invoke function:invoke my-api
```

**Example output:**
```
Executing function 'my-api'...
✅ Function executed successfully in 63ms

📤 Response:

{
  "message": "Hello, World!",
  "timestamp": 1708675200687
}
```

### HTTP Methods

Specify the HTTP method:

```bash
# GET request (default)
invoke function:invoke my-api --method GET

# POST request
invoke function:invoke my-api --method POST

# Other methods
invoke function:invoke my-api --method PUT
invoke function:invoke my-api --method DELETE
invoke function:invoke my-api --method PATCH
```

### Sending Data

**JSON data:**
```bash
invoke function:invoke my-api \
  --method POST \
  --data '{"name": "John", "email": "john@example.com"}'
```

**Raw body:**
```bash
invoke function:invoke my-api \
  --method POST \
  --body "Plain text data"
```

**From file:**
```bash
invoke function:invoke my-api \
  --method POST \
  --file ./request-data.json
```

Priority: `--body` > `--data` > `--file`

### Custom Headers

Add custom headers:

```bash
# Single header
invoke function:invoke my-api \
  --header "Authorization: Bearer token123"

# Multiple headers
invoke function:invoke my-api \
  --header "Authorization: Bearer token123" \
  --header "X-Request-ID: abc-123" \
  --header "Content-Type: application/json"
```

### URL Paths

Append paths to the invocation URL:

```bash
# Invoke /users/123
invoke function:invoke my-api --path "/users/123"

# Invoke /api/v1/products
invoke function:invoke my-api --path "/api/v1/products"
```

This transforms:
- From: `http://localhost:3001/invoke/{id}`
- To: `http://localhost:3001/invoke/{id}/users/123`

### Timeout Control

Set a custom timeout (in milliseconds):

```bash
# 60 second timeout
invoke function:invoke my-api --timeout 60000

# Default is 30 seconds
invoke function:invoke my-api --timeout 30000
```

### JSON Output

Get machine-readable output:

```bash
invoke function:invoke my-api --output json
```

**Example JSON output:**
```json
{
  "status": 200,
  "duration": 63,
  "data": {
    "message": "Hello, World!"
  }
}
```

## Testing Functions

The `function:test` command provides enhanced output with function details and recent logs.

### Basic Test

```bash
invoke function:test my-api
```

**Example output:**
```
🧪 Testing Function:

Name: my-api
ID: cd23cc1f-936f-445e-b2ba-dd8306b8dc01
Active: Yes
Version: 2
Requires API Key: No

⚡ Executing...

✅ Success in 47ms

📊 Response:

{
  "message": "Test successful"
}

📋 Recent Logs:

┌───────────────────────┬────────┬──────────┐
│ Time                  │ Status │ Duration │
├───────────────────────┼────────┼──────────┤
│ 23/2/2026, 2:10:57 pm │ ✅ 200 │ 47ms     │
│ 23/2/2026, 2:08:00 pm │ ✅ 200 │ 30ms     │
│ 23/2/2026, 2:07:51 pm │ ✅ 200 │ 33ms     │
└───────────────────────┴────────┴──────────┘
```

### Test with Data

```bash
invoke function:test my-api \
  --method POST \
  --data '{"test": "value"}'
```

### Test with Custom Path

```bash
invoke function:test my-api --path "/api/status"
```

## Complete Examples

### REST API Testing

```bash
# GET request
invoke function:invoke my-api \
  --method GET \
  --path "/users/123" \
  --header "Authorization: Bearer token123"

# POST request
invoke function:invoke my-api \
  --method POST \
  --path "/users" \
  --header "Content-Type: application/json" \
  --data '{"name": "John Doe", "email": "john@example.com"}'

# PUT request
invoke function:invoke my-api \
  --method PUT \
  --path "/users/123" \
  --data '{"name": "Jane Doe"}'

# DELETE request
invoke function:invoke my-api \
  --method DELETE \
  --path "/users/123"
```

### Authentication Testing

```bash
# Test with API key
invoke function:invoke my-api \
  --header "x-api-key: func_abc123..." \
  --data '{"action": "process"}'

# Test with Bearer token
invoke function:invoke my-api \
  --header "Authorization: Bearer eyJhbGc..." \
  --method POST
```

### File Upload Simulation

```bash
# Send JSON file content
invoke function:invoke my-api \
  --method POST \
  --file ./upload-data.json

# Send custom content type
invoke function:invoke my-api \
  --method POST \
  --header "Content-Type: text/csv" \
  --body "$(cat data.csv)"
```

### Webhook Testing

```bash
# Simulate webhook payload
invoke function:invoke webhook-handler \
  --method POST \
  --header "X-Webhook-Signature: sha256=abc..." \
  --data '{
    "event": "payment.success",
    "data": {
      "amount": 1000,
      "currency": "USD"
    }
  }'
```

### Load Testing

Simple load test using a loop:

```bash
#!/bin/bash

echo "Running 100 requests..."
for i in {1..100}; do
  invoke function:invoke my-api \
    --output json \
    --data "{\"request\": $i}" \
    >> results.log
done

echo "Complete! Check results.log"
```

### Error Handling

Test error scenarios:

```bash
# Test with invalid data
invoke function:invoke my-api \
  --method POST \
  --data '{"invalid": true}'

# Test timeout
invoke function:invoke my-api \
  --timeout 1000  # 1 second timeout
```

## Comparing Invoke vs Test

| Feature | `function:invoke` | `function:test` |
|---------|------------------|-----------------|
| Execute function | ✅ | ✅ |
| Show response | ✅ | ✅ |
| Function details | ❌ | ✅ |
| Recent logs | ❌ | ✅ |
| JSON output | ✅ | ❌ |
| Custom timeout | ✅ | ❌ |
| Use case | Production/automation | Development/debugging |

## Tips

### Quick Function Test

```bash
# Fast syntax check
invoke function:test my-api --data '{}'
```

### Debugging Responses

```bash
# Get full response details
invoke function:invoke my-api --output json | jq '.'
```

### Automation Scripts

```bash
#!/bin/bash

# Automated testing script
response=$(invoke function:invoke my-api \
  --method POST \
  --data '{"test": true}' \
  --output json)

status=$(echo $response | jq -r '.status')

if [ "$status" = "200" ]; then
  echo "✅ Test passed"
  exit 0
else
  echo "❌ Test failed: $status"
  exit 1
fi
```

### Performance Monitoring

```bash
# Measure response time
for i in {1..10}; do
  invoke function:invoke my-api --output json | \
    jq '.duration' | \
    awk '{sum+=$1} END {print "Avg:", sum/NR "ms"}'
done
```

### Using with CI/CD

GitHub Actions example:

```yaml
- name: Test function
  run: |
    invoke function:test my-api --output json > test-result.json
    if [ $? -ne 0 ]; then
      echo "Function test failed"
      exit 1
    fi
```

## Error Messages

### "Function not found"

The function name or ID doesn't exist:
```bash
invoke function:get my-api  # Check if function exists
invoke function:list        # List all functions
```

### "No active version"

Upload and activate a version:
```bash
invoke function:versions:upload my-api ./my-function --switch
```

### "Execution failed"

Check the function logs:
```bash
invoke function:logs my-api --limit 10
```

### "Timeout"

Increase timeout or optimize your function:
```bash
invoke function:invoke my-api --timeout 60000
```

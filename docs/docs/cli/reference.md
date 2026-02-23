---
sidebar_position: 8
---

# Command Reference

Complete reference of all Invoke CLI commands.

## Configuration Commands

### `config:set`

Configure API key and server URLs.

```bash
invoke config:set [options]
```

**Options:**
- `--api-key <key>` - API key for authentication
- `--base-url <url>` - Base URL for Invoke API (default: http://localhost:3000)
- `--execution-url <url>` - Execution service URL (default: http://localhost:3001)

**Examples:**
```bash
invoke config:set --api-key inv_abc123
invoke config:set --base-url https://api.invoke.com
```

---

### `config:show`

Display current configuration.

```bash
invoke config:show
```

---

## Function Management Commands

### `function:list`

List all functions.

```bash
invoke function:list [options]
```

**Options:**
- `--output <format>` - Output format: `table` or `json` (default: table)

---

### `function:get`

Get function details.

```bash
invoke function:get <id> [options]
```

**Arguments:**
- `<id>` - Function ID (UUID) or name

**Options:**
- `--output <format>` - Output format: `table` or `json`

---

### `functions:create`

Create a new function with code.

```bash
invoke functions:create [options] <path>
```

**Arguments:**
- `<path>` - Path to function directory or zip file

**Options:**
- `--name <name>` - Function name (required)
- `--description <text>` - Function description
- `--project-id <id>` - Project ID
- `--active <value>` - Set active status: `true` or `false`
- `--requires-api-key <value>` - Require API key: `true` or `false`
- `--output <format>` - Output format: `table` or `json`

---

### `function:update`

Update function metadata.

```bash
invoke function:update <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--name <name>` - New function name
- `--description <text>` - New description
- `--active <value>` - Set active status: `true` or `false`
- `--requires-api-key <value>` - Require API key: `true` or `false`
- `--output <format>` - Output format: `table` or `json`

---

### `function:delete`

Delete a function.

```bash
invoke function:delete <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--force` - Skip confirmation prompt

---

### `function:activate`

Activate a function.

```bash
invoke function:activate <id>
```

**Arguments:**
- `<id>` - Function ID or name

---

### `function:deactivate`

Deactivate a function.

```bash
invoke function:deactivate <id>
```

**Arguments:**
- `<id>` - Function ID or name

---

## Version Management Commands

### `function:versions:list`

List all versions of a function.

```bash
invoke function:versions:list <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--output <format>` - Output format: `table` or `json`

---

### `function:versions:upload`

Upload a new version.

```bash
invoke function:versions:upload <id> <path> [options]
```

**Arguments:**
- `<id>` - Function ID or name
- `<path>` - Path to function directory or zip file

**Options:**
- `--switch` - Automatically switch to this version after upload
- `--output <format>` - Output format: `table` or `json`

---

### `function:versions:switch`

Switch the active version.

```bash
invoke function:versions:switch <id> --ver <number>
```

**Arguments:**
- `<id>` - Function ID or name

**Required Options:**
- `--ver <number>` - Version number to switch to

---

### `function:versions:delete`

Delete a specific version.

```bash
invoke function:versions:delete <id> --ver <number> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Required Options:**
- `--ver <number>` - Version number to delete

**Options:**
- `--force` - Skip confirmation prompt

---

### `function:versions:download`

Download a version's code.

```bash
invoke function:versions:download <id> --ver <number> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Required Options:**
- `--ver <number>` - Version number to download

**Options:**
- `--output <path>` - Output path (ends with .zip to save as zip, otherwise extracts)

---

## Environment Variable Commands

### `function:env:list`

List environment variables for a function.

```bash
invoke function:env:list <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--output <format>` - Output format: `table` or `json`

---

### `function:env:set`

Set an environment variable.

```bash
invoke function:env:set <id> <key> <value>
```

**Arguments:**
- `<id>` - Function ID or name
- `<key>` - Variable key
- `<value>` - Variable value

---

### `function:env:delete`

Delete an environment variable.

```bash
invoke function:env:delete <id> <key> [options]
```

**Arguments:**
- `<id>` - Function ID or name
- `<key>` - Variable key

**Options:**
- `--force` - Skip confirmation prompt

---

## Execution Commands

### `function:invoke`

Execute a function.

```bash
invoke function:invoke <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--path <path>` - Path to append to URL (e.g., /users/123)
- `--method <method>` - HTTP method: GET, POST, PUT, DELETE, or PATCH (default: GET)
- `--header <header...>` - Custom headers (repeatable)
- `--data <json>` - JSON data to send
- `--body <data>` - Raw request body
- `--file <path>` - Path to JSON file with request data
- `--timeout <ms>` - Timeout in milliseconds (default: 30000)
- `--output <format>` - Output format: `table` or `json`

**Examples:**
```bash
# GET request
invoke function:invoke my-api --method GET

# POST with JSON
invoke function:invoke my-api --method POST --data '{"name":"John"}'

# Custom path and headers
invoke function:invoke my-api \
  --path "/users/123" \
  --header "Authorization: Bearer token" \
  --header "X-Custom: value"
```

---

### `function:test`

Test a function with enhanced output.

```bash
invoke function:test <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--path <path>` - Path to append to URL
- `--method <method>` - HTTP method (default: POST)
- `--header <header...>` - Custom headers (repeatable)
- `--data <json>` - JSON data to send
- `--body <data>` - Raw request body
- `--file <path>` - Path to JSON file with request data

Displays function details, execution result, and recent logs.

---

## Log Commands

### `function:logs`

View function execution logs.

```bash
invoke function:logs <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--status <type>` - Filter by status: `all`, `success`, or `error` (default: all)
- `--limit <n>` - Number of logs to retrieve (default: 50)
- `--page <n>` - Page number (default: 1)
- `--output <format>` - Output format: `table` or `json`

**Examples:**
```bash
# Get last 10 logs
invoke function:logs my-api --limit 10

# Get errors only
invoke function:logs my-api --status error

# Get page 2
invoke function:logs my-api --page 2 --limit 20
```

---

## API Key Commands

### `function:key:show`

Show function's API key.

```bash
invoke function:key:show <id>
```

**Arguments:**
- `<id>` - Function ID or name

---

### `function:key:regenerate`

Regenerate function's API key.

```bash
invoke function:key:regenerate <id> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Options:**
- `--force` - Skip confirmation prompt

---

## Retention Commands

### `function:retention:set`

Set log retention settings.

```bash
invoke function:retention:set <id> --type <type> [options]
```

**Arguments:**
- `<id>` - Function ID or name

**Required Options:**
- `--type <type>` - Retention type: `time`, `count`, or `none`

**Options (based on type):**
- `--days <n>` - Days to retain logs (for time-based retention)
- `--count <n>` - Number of logs to retain (for count-based retention)

**Examples:**
```bash
# Keep logs for 7 days
invoke function:retention:set my-api --type time --days 7

# Keep last 1000 logs
invoke function:retention:set my-api --type count --count 1000

# Keep all logs
invoke function:retention:set my-api --type none
```

---

## Scheduling Commands

### `function:schedule:set`

Set a cron schedule for function execution.

```bash
invoke function:schedule:set <id> --cron <expression>
```

**Arguments:**
- `<id>` - Function ID or name

**Required Options:**
- `--cron <expression>` - Cron expression (standard 5-field format)

**Examples:**
```bash
# Run every minute
invoke function:schedule:set my-api --cron "* * * * *"

# Run daily at midnight
invoke function:schedule:set my-api --cron "0 0 * * *"

# Run every Monday at 9 AM
invoke function:schedule:set my-api --cron "0 9 * * 1"
```

---

### `function:schedule:disable`

Disable scheduled execution.

```bash
invoke function:schedule:disable <id>
```

**Arguments:**
- `<id>` - Function ID or name

---

## Global Options

These options work with most commands:

- `--help`, `-h` - Display help for command
- `--version`, `-V` - Display CLI version

**Examples:**
```bash
# Get help for a command
invoke function:invoke --help

# Check CLI version
invoke --version
```

---

## Exit Codes

- `0` - Success
- `1` - Error (with error message displayed)

---

## Tips

### Using Function Names

All function commands support using function names instead of UUIDs:

```bash
# Both work the same
invoke function:get cd23cc1f-936f-445e-b2ba-dd8306b8dc01
invoke function:get my-api
```

### JSON Output for Scripting

Most commands support `--output json` for machine-readable output:

```bash
invoke function:list --output json | jq '.[] | .name'
```

### Multiple Headers

The `--header` option can be repeated:

```bash
invoke function:invoke my-api \
  --header "Authorization: Bearer token" \
  --header "X-Custom-Header: value" \
  --header "Content-Type: application/json"
```

### Skip Confirmations

Use `--force` to skip confirmation prompts in scripts:

```bash
invoke function:delete my-api --force
invoke function:versions:delete my-api --ver 1 --force
```

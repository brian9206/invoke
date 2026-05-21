---
sidebar_position: 9
---

# Command Reference

Complete reference of all Invoke CLI commands.

## Cross-Project Function Reference

Most function commands accept a function argument as a name, UUID, or the `@project-slug/function-name` shorthand. This lets you work with functions in any project without switching your default project:

```bash
# Referencing a function in another project
invoke function:test @analytics/data-processor
invoke function:invoke @billing/invoice-handler --method POST
invoke function:get @my-project/my-api

# Using a project slug in --project options
invoke function:deploy --name my-api --project @my-project
invoke function:list --project my-project
```

The `project-slug` is the unique slug assigned to each project (visible in the admin UI under project settings).

---

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

## Scaffolding Commands

### `init`

Scaffold a new function directory from an embedded template. Runs interactively by default.

```bash
invoke init [path] [options]
```

**Arguments:**

- `[path]` - Directory to create (defaults to the function name)

**Options:**

- `--name <name>` - Function name
- `--language <language>` - Language: `javascript`, `typescript`, or `csharp`
- `--runtime <runtime>` - Runtime: `bun` (JS/TS) or `dotnet` (C#)
- `--template <template>` - Template path, e.g. `bun-typescript-function`, `dotnet-csharp-app`

**Interactive prompts (when options are omitted):**

```
$ invoke init hello-function
? Function name: hello
? Language:
  ❯ JavaScript
    TypeScript
    C#
? Template:
  ❯ Simple Function — Single handler, handles all requests
    Multi-Route App — Router with multiple paths and methods
    Realtime Handler — Socket.IO-style event-driven namespace
```

**Examples:**

```bash
# Interactive
invoke init hello-function

# Non-interactive JavaScript function
invoke init hello-function --name hello --language javascript --template bun-javascript-function

# Non-interactive C# app
invoke init my-api --name my-api --language csharp --template dotnet-csharp-app
```

**Generated files (JavaScript):**

```
hello-function/
├── index.js
└── package.json
```

**Generated files (TypeScript):**

```
hello-function/
├── index.ts
├── tsconfig.json
└── package.json
```

**Generated files (C#):**

```
hello-function/
├── Function.cs     # or App.cs for router/realtime
└── app.csproj
```

:::tip
After scaffolding, deploy with:

```bash
cd hello-function
invoke function:deploy --name hello --project "my-project"
```

:::

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

- `<id>` - Function ID (UUID), name, or `@project-slug/function-name`

**Options:**

- `--output <format>` - Output format: `table` or `json`

---

### `function:create`

Create a new function with code.

```bash
invoke function:create [options] <path>
```

**Arguments:**

- `<path>` - Path to function directory or zip file

**Options:**

- `--name <name>` - Function name (required)
- `--project <id>` - Project ID or name (required)
- `--language <language>` - Language: `javascript`, `typescript`, or `csharp` (required)
- `--runtime <runtime>` - Runtime: `bun` (JS/TS) or `dotnet` (C#) (required)
- `--description <text>` - Function description
- `--output <format>` - Output format: `table` or `json`

**Examples:**

```bash
invoke function:create --name my-api --project "my-project" --language javascript --runtime bun ./my-function
invoke function:create --name my-api --project "my-project" --language csharp --runtime dotnet ./my-csharp-function
```

---

### `function:deploy`

Deploy a function — creates it if it doesn't exist, then uploads and activates a new version (smart upsert).

```bash
invoke function:deploy [path] [options]
```

**Arguments:**

- `[path]` - Path to function directory or zip file (default: `.`)

**Required Options:**

- `--name <name>` - Function name
- `--project <id>` - Project ID, name, slug, or `@project-slug`

**Options:**

- `--description <text>` - Function description (used on first creation only)
- `--requires-api-key` - Require API key for invocation (creation only)
- `--output <format>` - Output format: `table` or `json` (default: table)

**Examples:**

```bash
# Deploy current directory
invoke function:deploy --name hello --project "my-project"

# Deploy using project slug with @ prefix
invoke function:deploy --name hello --project @my-project

# Deploy a specific path
invoke function:deploy ./hello-function --name hello --project "my-project"

# Full scaffold + deploy workflow
invoke init hello-function --name hello --project "my-project"
cd hello-function
invoke function:deploy --name hello --project "my-project"
```

The CLI will:

1. Check if the function exists; create it if not
2. Upload the code (auto-zips directories)
3. Automatically activate the new version

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

- `<id>` - Function ID (UUID), name, or `@project-slug/function-name`

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
# GET request (default project)
invoke function:invoke my-api --method GET

# POST with JSON (cross-project @slug syntax)
invoke function:invoke @my-project/my-api --method POST --data '{"name":"John"}'

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

- `<id>` - Function ID (UUID), name, or `@project-slug/function-name`

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

## Local Runner

### `run`

Run a function locally using the same sandbox environment as the execution service. No server or network connection is required.

```bash
invoke run [path]
```

**Arguments:**

- `[path]` - Directory containing the function's `index.js` (default: `.`)

**Options:**

- `-m, --method <method>` - HTTP method (default: `GET`)
- `-p, --path <urlpath>` - Request URL path (default: `/`)
- `-d, --data <json>` - Request body as a JSON string
- `-H, --header <key:value>` - Request header, repeatable
- `-e, --env <file>` - `.env` file to load (default: `<path>/.env`)
- `--kv-file <file>` - JSON file for persistent KV storage (default: in-memory)

**Examples:**

```bash
# Run the function in the current directory
invoke run

# Run with a POST request and JSON body
invoke run ./my-function --method POST --data '{"key": "value"}'

# Run with a custom path and headers
invoke run ./my-function \
  --path /users/42 \
  --header "Authorization: Bearer token123"

# Persist KV state across runs
invoke run ./my-function --kv-file ./local-kv.json

# Use a custom env file
invoke run ./my-function --env .env.staging
```

See [Local Function Runner](./local-run) for full documentation.

---

## Database Commands

### `sql:connect`

Start a local PostgreSQL proxy tunnel to a project's SQL database. Forwards a local TCP port to the project database over the Invoke SQL relay, so you can connect with `psql`, TablePlus, DBeaver, or any standard PostgreSQL client.

```bash
invoke sql:connect --project <id> [options]
```

**Required Options:**

- `--project <id>` - Project ID, name, or `@slug`

**Options:**

- `--port <port>` - Local TCP port to listen on (default: `5433`)

**Examples:**

```bash
# Connect to a project by name
invoke sql:connect --project "Default Project"

# Connect using project slug
invoke sql:connect --project @my-project

# Use a custom local port
invoke sql:connect --project "my-project" --port 12345
```

Once the tunnel is running, connect with `psql` or any PostgreSQL client:

```bash
psql -h localhost -p 5433
```

:::note
The database must be initialized first via **Admin Panel → SQL Database → Initialize Database**.

The tunnel uses your configured API key (`invoke config:set --api-key`) and connects through the SQL relay URL configured in the admin global settings.
:::

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

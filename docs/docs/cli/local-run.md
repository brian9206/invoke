---
sidebar_position: 7
---

# Local Function Runner

Run functions locally on your machine without a running execution service, admin panel, or any network connection. The `invoke run` command spins up the exact same isolated-vm sandbox used in production so behavior is identical.

## Basic Usage

```bash
# Run the function in the current directory
invoke run

# Run a function in a specific directory
invoke run ./my-function

# Run from an absolute path
invoke run /home/user/projects/my-function
```

The command looks for `index.js` inside the given directory (defaults to `.`).

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --method <method>` | HTTP method | `GET` |
| `-p, --path <urlpath>` | Request URL path | `/` |
| `-d, --data <json>` | Request body as a JSON string | — |
| `-H, --header <key:value>` | Request header — repeatable | — |
| `-e, --env <file>` | Path to a `.env` file to load | `<path>/.env` |
| `--kv-file <file>` | JSON file path for persistent KV storage | in-memory |

## Environment Variables

By default, `invoke run` automatically loads a `.env` file from the function directory if one exists. Use `--env` to point to a different file.

```bash
# Uses ./my-function/.env automatically
invoke run ./my-function

# Override with a specific env file
invoke run ./my-function --env ./staging.env

# No env file — only system env vars available inside the function
invoke run ./my-function --env /dev/null
```

Variables loaded via `--env` are injected into `process.env` inside the sandbox, the same way the execution service injects them from the database.

## Sending Requests

### HTTP Method

```bash
invoke run ./my-function --method POST
invoke run ./my-function --method DELETE
```

### Request Body

Pass a JSON body with `--data`:

```bash
invoke run ./my-function \
  --method POST \
  --data '{"name": "Alice", "email": "alice@example.com"}'
```

### URL Path

Functions that route on `req.path` can be tested with `--path`:

```bash
# Hits req.path === '/users/42'
invoke run ./my-function --path /users/42

# Hits req.path === '/api/v1/status'
invoke run ./my-function --method GET --path /api/v1/status
```

### Custom Headers

`--header` can be repeated:

```bash
invoke run ./my-function \
  --method POST \
  --header "Authorization: Bearer token123" \
  --header "X-Request-ID: local-test-1" \
  --data '{"action": "create"}'
```

## KV Store

The KV store (`kv` global inside functions) works in two modes:

### In-Memory (default)

State is discarded after each run. Useful for stateless functions or when you don't care about persistence.

```bash
invoke run ./my-function
```

### Persistent JSON File

Pass `--kv-file` to persist KV state across runs. The file is created automatically if it does not exist.

```bash
# First run — sets a value
invoke run ./my-function \
  --method POST \
  --data '{"key": "counter", "value": 1}' \
  --kv-file ./local-kv.json

# Second run — the value is still there
invoke run ./my-function \
  --method GET \
  --path /get/counter \
  --kv-file ./local-kv.json
```

The JSON file stores raw Keyv serialised data. You can inspect or reset it manually by editing or deleting the file.

## Output

Logs printed by the function (via `console.log`, `console.error`, etc.) appear before the response:

```
▶ Running: /home/user/projects/my-function
  KV store: in-memory

=== Logs ===
{ level: 'log', message: 'Processing request', timestamp: 1771895654635 }
{ level: 'log', message: 'Done', timestamp: 1771895654712 }

=== Response ===
Status: 200
{
  "success": true,
  "message": "Hello from the Invoke platform!"
}
```

If the function throws or returns an error status, the exit code is `1`.

## Execution Environment

`invoke run` uses the exact same execution environment as the production service:

- **Isolated V8 sandbox** via `isolated-vm` — the function cannot access Node.js globals directly
- **Virtual filesystem** — the function directory is mounted at `/app` inside the sandbox
- **Built-in modules** — the same set of sandboxed `require`-able modules (`crypto`, `http`, `path`, `fs`, etc.)
- **KV store** — the same `kv` global API (`kv.get`, `kv.set`, `kv.delete`, `kv.has`, `kv.clear`)
- **`req` / `res` globals** — fully compatible with functions written for the execution service
- **Pool size 1** — a single isolate is created, used once, then shut down cleanly

No database, no MinIO, and no network connection to the execution service is required.

## Complete Examples

### Hello World

```bash
invoke run ./samples/hello-world
```

### POST with JSON body

```bash
invoke run ./my-api \
  --method POST \
  --path /users \
  --data '{"name": "Bob"}' \
  --header "Content-Type: application/json"
```

### Stateful KV function across multiple runs

```bash
# Set a value
invoke run ./kv-function \
  --method POST \
  --path /set \
  --data '{"key": "visits", "value": 0}' \
  --kv-file ./local-kv.json

# Increment via function logic, read back
invoke run ./kv-function \
  --method GET \
  --path /get/visits \
  --kv-file ./local-kv.json
```

### Testing with a staging env file

```bash
invoke run ./my-function \
  --method POST \
  --data '{"payload": "test"}' \
  --env ./.env.staging
```

### Scripting / CI

Because `invoke run` exits with code `1` on function error, you can use it in scripts:

```bash
#!/bin/bash
invoke run ./my-function --method POST --data '{"smoke": true}'
if [ $? -ne 0 ]; then
  echo "Local smoke test failed"
  exit 1
fi
echo "Smoke test passed"
```

## Limitations

- **Network policies** are not enforced locally (all outbound requests are permitted).
- **No API key authentication** — the function always runs as if the request is pre-authenticated.
- `--data` parses the value as JSON. Use `--header "Content-Type: text/plain"` and adjust your function accordingly if you need a non-JSON body — but note that `--data` itself still requires valid JSON input.
- The KV file backend is a flat JSON file. It is not suitable for large datasets; use it for small, local dev state only.

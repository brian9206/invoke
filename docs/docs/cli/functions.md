---
sidebar_position: 3
---

# Function Management

Manage your serverless functions using the Invoke CLI.

## Creating Functions

### Create a Function

Create a new function with metadata and code:

```bash
invoke functions:create \
  --name my-api \
  --description "REST API handler" \
  --project-id abc123 \
  ./my-function
```

**Options:**
- `--name` (required): Function name
- `--description`: Function description
- `--project-id`: Project ID (defaults to default project)
- `--active`: Set active status (`true`/`false`, default: `true`)
- `--requires-api-key`: Require API key for execution
- `--output`: Output format (`table`/`json`)

**Example with API key:**
```bash
invoke functions:create \
  --name secure-api \
  --requires-api-key true \
  ./secure-function
```

The CLI will:
1. Create the function metadata
2. Upload the code (auto-zips directories)
3. Automatically activate the function

## Listing Functions

### List All Functions

```bash
invoke function:list
```

**Example output:**
```
⚡ Functions:

┌──────────────────────────┬───────────┬────────┬──────────┐
│ Name                     │ Project   │ Active │ Version  │
├──────────────────────────┼───────────┼────────┼──────────┤
│ my-api                   │ Default   │ Yes    │ 2        │
│ webhook-handler          │ Default   │ Yes    │ 1        │
│ data-processor           │ Analytics │ No     │ 3        │
└──────────────────────────┴───────────┴────────┴──────────┘
```

**With JSON output:**
```bash
invoke function:list --output json
```

## Getting Function Details

### Get Function Info

Use either the function ID or name:

```bash
# By name
invoke function:get my-api

# By UUID
invoke function:get cd23cc1f-936f-445e-b2ba-dd8306b8dc01
```

**Example output:**
```
⚡ Function Details:

ID: cd23cc1f-936f-445e-b2ba-dd8306b8dc01
Name: my-api
Description: REST API handler
Project: Default Project
Active: Yes
Requires API Key: No
Active Version: 2
Created: 23/2/2026, 1:44:11 pm
Updated: 23/2/2026, 2:15:30 pm
Last Executed: 23/2/2026, 2:10:57 pm
Total Executions: 142
```

## Updating Functions

### Update Function Metadata

```bash
invoke function:update my-api \
  --name my-rest-api \
  --description "Updated REST API" \
  --active true
```

**Options:**
- `--name`: New function name
- `--description`: New description
- `--active`: Set active status (`true`/`false`)
- `--requires-api-key`: Require API key (`true`/`false`)

## Activating and Deactivating

### Activate a Function

```bash
invoke function:activate my-api
```

### Deactivate a Function

```bash
invoke function:deactivate my-api
```

Deactivated functions cannot be executed until reactivated.

## Deleting Functions

### Delete a Function

```bash
invoke function:delete my-api
```

You'll be prompted for confirmation:
```
? Are you sure you want to delete function my-api? This cannot be undone. (y/N)
```

**Skip confirmation:**
```bash
invoke function:delete my-api --force
```

:::danger
Deleting a function removes all versions, logs, and environment variables permanently!
:::

## Function API Keys

### Show API Key

Display the function's API key (if enabled):

```bash
invoke function:key:show my-api
```

**Example output:**
```
🔑 Function API Key:

func_abc123def456...
```

### Regenerate API Key

Generate a new API key for the function:

```bash
invoke function:key:regenerate my-api
```

You'll be prompted for confirmation:
```
? Are you sure? This will invalidate the existing API key. (y/N)
```

**Skip confirmation:**
```bash
invoke function:key:regenerate my-api --force
```

**Example output:**
```
✅ API key regenerated successfully

🔑 New API Key:

func_xyz789abc123...
```

## Tips

### Using Function Names

All commands support function names in addition to UUIDs:

```bash
# These are equivalent
invoke function:get cd23cc1f-936f-445e-b2ba-dd8306b8dc01
invoke function:get my-api
```

### JSON Output

Get machine-readable output with `--output json`:

```bash
invoke function:get my-api --output json
```

This is useful for scripting and automation.

### Quick Status Check

```bash
invoke function:list | grep "my-api"
```

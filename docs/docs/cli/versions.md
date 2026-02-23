---
sidebar_position: 4
---

# Version Management

Manage multiple versions of your functions with the Invoke CLI.

## Understanding Versions

Every time you upload new code, a new version is created. Each version:
- Has a sequential version number (1, 2, 3, ...)
- Can be independently activated
- Contains the complete function code
- Has its own upload timestamp and size info

## Listing Versions

### List All Versions

```bash
invoke function:versions:list my-api
```

**Example output:**
```
📦 Function Versions:

┌─────────┬────────┬──────────┬───────────────────────┬────────┐
│ Version │ Status │ Size     │ Uploaded              │ Active │
├─────────┼────────┼──────────┼───────────────────────┼────────┤
│ 3       │ ready  │ 45.2 KB  │ 23/2/2026, 2:15:30 pm │ ✅     │
│ 2       │ ready  │ 39.8 KB  │ 23/2/2026, 1:44:11 pm │        │
│ 1       │ ready  │ 12.5 KB  │ 23/2/2026, 10:22:45 am│        │
└─────────┴────────┴──────────┴───────────────────────┴────────┘
```

**JSON output:**
```bash
invoke function:versions:list my-api --output json
```

## Uploading Versions

### Upload New Version

Upload a new version from a directory or zip file:

```bash
# From directory (auto-zips)
invoke function:versions:upload my-api ./my-function

# From zip file
invoke function:versions:upload my-api ./my-function.zip
```

**Example output:**
```
Preparing upload...
✅ Version 4 uploaded successfully
```

### Upload and Switch

Upload and immediately activate the new version:

```bash
invoke function:versions:upload my-api ./my-function --switch
```

**Example output:**
```
Preparing upload...
✅ Version 4 uploaded successfully
Switching to new version...
✅ Switched to version 4
```

This is equivalent to:
```bash
invoke function:versions:upload my-api ./my-function
invoke function:versions:switch my-api --ver 4
```

## Switching Versions

### Activate a Different Version

Switch the active version:

```bash
invoke function:versions:switch my-api --ver 2
```

**Example output:**
```
✅ Switched to version 2
```

The active version is the one that gets executed when you invoke the function.

## Downloading Versions

### Download Version Code

Download a version for backup or inspection:

```bash
# Extract to directory
invoke function:versions:download my-api --ver 3 --output ./backup

# Save as zip
invoke function:versions:download my-api --ver 3 --output ./backup.zip
```

**Example output:**
```
Downloading version...
✅ Downloaded to: ./backup
```

**Default behavior:**
- If output path ends with `.zip` → saves as zip file
- Otherwise → extracts to directory

## Deleting Versions

### Delete a Version

Remove an old or unwanted version:

```bash
invoke function:versions:delete my-api --ver 1
```

You'll be prompted for confirmation:
```
? Are you sure you want to delete version 1? This cannot be undone. (y/N)
```

**Skip confirmation:**
```bash
invoke function:versions:delete my-api --ver 1 --force
```

:::warning
- You cannot delete the active version
- Deleted versions cannot be recovered
- Version numbers are not reused
:::

## Version Workflow Examples

### Continuous Deployment

Automated deployment script:

```bash
#!/bin/bash

# Build your function
npm run build

# Upload and activate new version
invoke function:versions:upload my-api ./dist --switch --output json

# Check if successful
if [ $? -eq 0 ]; then
  echo "Deployment successful!"
else
  echo "Deployment failed!"
  exit 1
fi
```

### Safe Rollout

Upload first, test, then switch:

```bash
# 1. Upload new version (don't switch yet)
invoke function:versions:upload my-api ./new-code

# 2. Note the new version number (e.g., 5)
invoke function:versions:list my-api

# 3. Test the specific version manually
# (You'd need to temporarily switch or test in staging)

# 4. If tests pass, switch to new version
invoke function:versions:switch my-api --ver 5
```

### Quick Rollback

If something goes wrong, roll back immediately:

```bash
# List versions to see previous active version
invoke function:versions:list my-api

# Switch back to previous version
invoke function:versions:switch my-api --ver 4
```

### Version Cleanup

Remove old versions to save space:

```bash
# Delete old versions (keep last 3)
invoke function:versions:delete my-api --ver 1 --force
invoke function:versions:delete my-api --ver 2 --force
invoke function:versions:delete my-api --ver 3 --force
```

## Best Practices

### Version Numbering

- Versions are sequential integers (1, 2, 3...)
- Numbers are never reused, even after deletion
- Use `--ver` flag (not `--version`, which is reserved by Commander.js)

### Deployment Strategy

1. **Blue-Green**: Upload new version, test with specific clients, then switch for all
2. **Canary**: Upload, gradually route traffic, then full switch
3. **Immediate**: Upload with `--switch` for instant deployment

### Version Retention

Keep a few recent versions for quick rollback:
- Production: Keep last 5-10 versions
- Development: Keep only last 2-3 versions
- Archive old versions locally if needed

### Testing Versions

Before switching an active version:
1. Upload the new version
2. Test it in a staging environment
3. Review logs and metrics
4. Switch the active version
5. Monitor for any issues

## Tips

### Check Active Version

```bash
invoke function:get my-api | grep "Active Version"
```

### Compare Versions

Download two versions and use `diff`:

```bash
invoke function:versions:download my-api --ver 2 --output ./v2
invoke function:versions:download my-api --ver 3 --output ./v3
diff -r ./v2 ./v3
```

### Automate with JSON

```bash
# Get version info programmatically
versions=$(invoke function:versions:list my-api --output json)
latest=$(echo $versions | jq '.[0].version')
echo "Latest version: $latest"
```

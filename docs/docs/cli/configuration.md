---
sidebar_position: 2
---

# Configuration

Before using the Invoke CLI, you need to configure it with your API key and server URLs.

## Initial Setup

### Setting Your API Key

Configure the CLI with your Invoke API key:

```bash
invoke config:set --api-key YOUR_API_KEY_HERE
```

### Setting Server URLs (Optional)

If you're using a self-hosted instance or non-default URLs:

```bash
invoke config:set \
  --base-url https://your-admin-url.com \
  --execution-url https://your-execution-url.com
```

**Default URLs:**
- Admin API: `http://localhost:3000`
- Execution Service: `http://localhost:3001`

## View Current Configuration

Display your current CLI configuration:

```bash
invoke config:show
```

**Example output:**
```
⚙️  Configuration:

API Key: inv_abc123...xyz789
Base URL: http://localhost:3000
Execution URL: http://localhost:3001
```

## Configuration File

The CLI stores configuration in `~/.invoke/config.json`:

```json
{
  "apiKey": "inv_abc123...xyz789",
  "baseUrl": "http://localhost:3000",
  "executionUrl": "http://localhost:3001"
}
```

## Getting an API Key

1. Log into the Invoke Admin Panel
2. Navigate to **Settings** → **API Keys**
3. Click **Generate New API Key**
4. Copy the key (it won't be shown again!)
5. Use it with `invoke config:set --api-key YOUR_KEY`

## Security Best Practices

:::warning
Never commit your API key to version control! The config file is stored in your home directory, outside your project.
:::

- Keep your API key secure
- Rotate keys periodically
- Use different keys for different environments
- Revoke compromised keys immediately

## Troubleshooting

### "API key not configured"

Run `invoke config:set --api-key YOUR_KEY` to set your API key.

### "Connection refused"

Check that your base URL and execution URL are correct, and that the services are running.

### Permission Issues

If you get permission errors accessing the config file:

```bash
# Linux/macOS
chmod 600 ~/.invoke/config.json

# Windows
icacls %USERPROFILE%\.invoke\config.json /inheritance:r /grant:r "%USERNAME%:F"
```

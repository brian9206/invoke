# Invoke CLI

Command-line interface for managing Invoke serverless functions, with support for API key authentication.

## Installation

```bash
cd invoke-cli
npm install

# Optional: Install globally
npm install -g .
```

After global installation, use `invoke` instead of `node index.js`.

## Configuration

### Setup API Key Authentication

1. **Generate an API key** via the web interface:
   - Navigate to Profile Settings
   - Click "Generate New API Key"
   - Copy the key (it's only shown once!)

2. **Configure the CLI**:
   ```bash
   invoke config:set --api-key YOUR_API_KEY
   invoke config:set --base-url http://localhost:3000  # Optional, defaults to localhost:3000
   ```

3. **Verify configuration**:
   ```bash
   invoke config:show
   invoke auth:whoami
   ```

### Environment Variables

You can also use environment variables (these take precedence over config file):

```bash
export INVOKE_API_KEY="your-api-key"
export INVOKE_BASE_URL="http://localhost:3000"
export INVOKE_EXECUTION_URL="http://localhost:3001"
```

## Commands Reference

### Configuration Management

#### `config:set`
Configure API key and URLs.

```bash
invoke config:set --api-key <key>
invoke config:set --base-url http://localhost:3000
invoke config:set --execution-url http://localhost:3001
```

**Options:**
- `--api-key <key>` - API key for authentication
- `--base-url <url>` - Base URL for Invoke API
- `--execution-url <url>` - Execution service URL

#### `config:show`
Display current configuration (masked API key).

```bash
invoke config:show
```

#### `config:clear`
Clear all configuration.

```bash
invoke config:clear
```

### Authentication

#### `auth:whoami`
Display current user information and project memberships.

```bash
invoke auth:whoami
invoke auth:whoami --output json
```

**Options:**
- `--output <format>` - Output format: `table` or `json` (default: table)

### Project Management

#### `projects:list`
List projects accessible to the current user.

```bash
invoke projects:list
invoke projects:list --output json
```

**Options:**
- `--output <format>` - Output format: `table` or `json`

### Function Management (To Be Implemented)

The following commands are planned and follow the same pattern:

#### Core CRUD
- `functions:list [--project <id>] [--output json]` - List functions
- `functions:get <id> [--output json]` - Get function details
- `functions:create <path> --name <name> --project <id> [--description <text>]` - Create function
- `functions:update <id> [--name] [--description] [--active true|false]` - Update function
- `functions:delete <id> [--force]` - Delete function

#### Configuration
- `functions:env:list <id>` - List environment variables
- `functions:env:set <id> <key> <value>` - Set environment variable
- `functions:env:delete <id> <key> [--force]` - Delete environment variable
- `functions:retention:get <id>` - Get retention settings
- `functions:retention:set <id> --type <time|count|none> [--days <n>] [--count <n>]` - Set retention
- `functions:schedule:get <id>` - Get schedule settings
- `functions:schedule:set <id> --cron <expression>` - Set schedule
- `functions:schedule:disable <id>` - Disable schedule

#### Versioning
- `functions:versions:list <id>` - List all versions
- `functions:versions:upload <id> <path> [--switch]` - Upload new version
- `functions:versions:switch <id> --version <number>` - Switch active version
- `functions:versions:delete <id> --version <number> [--force]` - Delete version
- `functions:versions:download <id> --version <number> [--output <path>]` - Download version

#### Logs & Keys
- `functions:logs <id> [--status all|success|error] [--limit <n>]` - View execution logs
- `functions:key:show <id>` - Show function API key
- `functions:key:regenerate <id> [--force]` - Regenerate function API key

#### Execution
- `functions:invoke <id> [--data <json>] [--file <path>] [--method GET|POST]` - Execute function
- `functions:test <id>` - Test function with enhanced output

### Legacy Commands (Direct Database Access)

These commands access the database directly and don't require API keys:

- `user:create` - Create a new user interactively
- `user:list` - List all users
- `user:delete` - Delete a user interactively
- `db:status` - Check database connection

## Features

### Non-Interactive Design
All new commands are designed for CI/CD integration - no prompts, all configuration via flags:

```bash
# CI/CD example
export INVOKE_API_KEY="$SECRET_API_KEY"
invoke functions:create ./build --name "$APP_NAME" --project "$PROJECT_ID" --output json
invoke functions:env:set "$FUNC_ID" DATABASE_URL "$DB_URL"
invoke functions:test "$FUNC_ID" --data '{"test": true}'
```

### Smart File Handling

#### Upload (Auto-Zip)
The CLI automatically zips directories before upload:

```bash
# Both work identically
invoke functions:create ./my-function/       # Auto-zips directory
invoke functions:create ./my-function.zip    # Uses existing zip
```

#### Download (Smart Extract)
Downloads can be saved as zip or auto-extracted:

```bash
# Save as zip
invoke functions:versions:download func-123 --version 2 --output backup.zip

# Extract to directory (auto-creates directories)
invoke functions:versions:download func-123 --version 2 --output ./function-src

# Default: extracts to ./function-<id>-v<version>/
invoke functions:versions:download func-123 --version 2
```

### JSON Output
All commands support JSON output for parsing:

```bash
invoke functions:list --output json | jq '.[] | select(.is_active == true)'
invoke auth:whoami --output json | jq -r '.projects[].name'
```

## API Key Permissions

API keys inherit the user's existing roles and project memberships:

- **Admin users**: API keys have full access to all projects
- **Regular users**: API keys are limited to assigned projects with their specific roles
- **Project roles**: 
  - `developer` - Can create, update, and manage functions
  - `owner` - Full project access including settings

## Architecture

```
invoke-cli/
├── index.js                    # Main CLI entry point with commands
├── package.json               # Dependencies and bin configuration
├── services/
│   ├── config.js              # Configuration management (~/.invoke/config.json)
│   ├── api-client.js          # HTTP client with API key auth
│   ├── file-utils.js          # File/directory zipping and extraction
│   ├── database.js            # Direct database access (legacy commands)
│   └── utils.js               # Shared utilities (hashing, etc.)
```

## Security

- API keys are stored in `~/.invoke/config.json` with restrictive permissions
- Keys are never logged or displayed (except during creation)
- Environment variables override config file (useful for CI/CD)
- All API requests use HTTPS in production

## Troubleshooting

### "No API key configured"
Run `invoke config:set --api-key <your-key>` or set `INVOKE_API_KEY` environment variable.

### "Authentication failed"
Your API key may be invalid or revoked. Generate a new one in Profile Settings.

### "Access denied"
Your user account doesn't have permission for this operation. Check your project membership and role.

### Connection errors
Verify the base URL with `invoke config:show` and ensure the server is running.

## Development

### Adding New Commands

Follow this pattern:

```javascript
program
  .command('resource:action')
  .description('Description of what it does')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .option('--other-flag <value>', 'Other options')
  .action(async (options) => {
    try {
      // Call API
      const data = await api.get('/api/endpoint', { params: options })
      
      // Handle response
      if (options.output === 'json') {
        console.log(JSON.stringify(data, null, 2))
        return
      }
      
      // Display formatted output
      console.log(chalk.cyan('Result:'))
      // ... format and display
      
    } catch (error) {
      console.log(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })
```

## License

MIT

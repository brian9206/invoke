# Invoke CLI Quick Start Guide

## Installation

```bash
cd invoke-cli
npm install
npm link  # Optional: Install globally
```

## Initial Setup (3 Steps)

### Step 1: Generate an API Key
1. Open the Invoke Admin Panel: http://localhost:3000
2. Log in with your admin account
3. Navigate to **Profile Settings**
4. Click **"Generate New API Key"**
5. **Important:** Copy the key immediately (it's only shown once!)

### Step 2: Configure the CLI
```bash
invoke config:set --api-key YOUR_API_KEY_HERE
```

### Step 3: Verify Setup
```bash
invoke auth:whoami
```

You should see your user information and projects.

## Common Tasks

### Create and Deploy a Function

```bash
# Create a new function from a directory (auto-zips)
invoke functions:create ./my-function \
  --name my-awesome-function \
  --project PROJECT_ID \
  --description "My awesome serverless function"

# Or from an existing zip file
invoke functions:create ./function.zip \
  --name my-function \
  --project PROJECT_ID
```

### Manage Environment Variables

```bash
# Set environment variables
invoke functions:env:set FUNC_ID DATABASE_URL "postgresql://..."
invoke functions:env:set FUNC_ID API_SECRET "secret123"

# List environment variables
invoke functions:env:list FUNC_ID

# Delete an environment variable
invoke functions:env:delete FUNC_ID API_SECRET --force
```

### Upload New Versions

```bash
# Upload and automatically switch to new version
invoke functions:versions:upload FUNC_ID ./updated-code --switch

# Just upload without switching
invoke functions:versions:upload FUNC_ID ./updated-code

# List all versions
invoke functions:versions:list FUNC_ID

# Switch to a different version
invoke functions:versions:switch FUNC_ID --version 2

# Download a version
invoke functions:versions:download FUNC_ID --version 2 --output ./backup
```

### Execute Functions

```bash
# Simple test
invoke functions:invoke FUNC_ID

# With JSON data
invoke functions:invoke FUNC_ID --data '{"name": "John", "age": 30}'

# From JSON file
invoke functions:invoke FUNC_ID --file ./request.json

# Enhanced test with logs
invoke functions:test FUNC_ID --data '{"test": true}'
```

### View Logs

```bash
# View recent logs
invoke functions:logs FUNC_ID

# Filter by status
invoke functions:logs FUNC_ID --status error --limit 20

# Export as JSON
invoke functions:logs FUNC_ID --output json > logs.json
```

### Manage Function Settings

```bash
# Set retention policy (keep logs for 30 days)
invoke functions:retention:set FUNC_ID --type time --days 30

# Set retention policy (keep last 1000 logs)
invoke functions:retention:set FUNC_ID --type count --count 1000

# Disable retention (keep all logs)
invoke functions:retention:set FUNC_ID --type none

# Set schedule (run every day at midnight)
invoke functions:schedule:set FUNC_ID --cron "0 0 * * *"

# Disable schedule
invoke functions:schedule:disable FUNC_ID
```

## CI/CD Integration Examples

### GitHub Actions

```yaml
name: Deploy Function

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install Invoke CLI
        run: |
          cd invoke-cli
          npm install
          npm link
      
      - name: Deploy Function
        env:
          INVOKE_API_KEY: ${{ secrets.INVOKE_API_KEY }}
          INVOKE_BASE_URL: https://invoke.example.com
        run: |
          # Create or update function
          FUNC_ID=$(invoke functions:list --project ${{ secrets.PROJECT_ID }} --output json | jq -r '.[0].id')
          
          if [ -z "$FUNC_ID" ]; then
            # Create new function
            invoke functions:create ./build \
              --name ${{ github.event.repository.name }} \
              --project ${{ secrets.PROJECT_ID }} \
              --output json > result.json
            
            FUNC_ID=$(jq -r '.id' result.json)
          else
            # Upload new version and switch
            invoke functions:versions:upload $FUNC_ID ./build --switch
          fi
          
          # Set environment variables
          invoke functions:env:set $FUNC_ID NODE_ENV production
          
          # Test the function
          invoke functions:test $FUNC_ID --data '{"test": true}'
```

### GitLab CI

```yaml
deploy:
  stage: deploy
  script:
    - cd invoke-cli && npm install && npm link
    - |
      invoke functions:create ./function \
        --name ${CI_PROJECT_NAME} \
        --project ${PROJECT_ID} \
        --output json
    - invoke functions:test $(cat function-id.txt)
  only:
    - main
  variables:
    INVOKE_API_KEY: $INVOKE_API_KEY
    INVOKE_BASE_URL: https://invoke.example.com
```

## JSON Output for Scripting

All commands support `--output json` for parsing:

```bash
# Get all active functions
invoke functions:list --output json | jq '.[] | select(.is_active == true) | .id'

# Check if specific function exists
FUNC_EXISTS=$(invoke functions:list --project $PROJECT_ID --output json | jq -r '.[] | select(.name == "my-function") | .id')

if [ -n "$FUNC_EXISTS" ]; then
  echo "Function exists: $FUNC_EXISTS"
else
  echo "Function not found"
fi

# Get project IDs
invoke projects:list --output json | jq -r '.[].id'

# Execute and capture result
RESULT=$(invoke functions:invoke FUNC_ID --data '{"input": "test"}' --output json)
echo $RESULT | jq -r '.data'
```

## Tips & Best Practices

### 1. Use Environment Variables in CI/CD
Never hardcode API keys. Use environment variables:

```bash
export INVOKE_API_KEY="your-key"
export INVOKE_BASE_URL="https://your-server.com"
```

### 2. Version Control Best Practices
```bash
# Always test before deploying
invoke functions:test FUNC_ID

# Upload new version without immediately switching
invoke functions:versions:upload FUNC_ID ./code

# Test the new version
# If successful, then switch
invoke functions:versions:switch FUNC_ID --version 2
```

### 3. Backup Functions
```bash
# Download current version before updates
invoke functions:versions:download FUNC_ID \
  --version $(invoke functions:get FUNC_ID --output json | jq -r '.active_version') \
  --output ./backups/function-$(date +%Y%m%d).zip
```

### 4. Use --force in Automation
Skip confirmation prompts in scripts:

```bash
invoke functions:delete OLD_FUNC_ID --force
invoke functions:env:delete FUNC_ID OLD_VAR --force
```

## Troubleshooting

### "No API key configured"
**Solution:** Run `invoke config:set --api-key YOUR_KEY` or set `INVOKE_API_KEY` environment variable.

### "Authentication failed"
**Cause:** API key is invalid or revoked  
**Solution:** Generate a new API key in Profile Settings.

### "Access denied"
**Cause:** Your user doesn't have permission for this project  
**Solution:** Ask a project owner to add you as a developer.

### "Function not found"
**Cause:** Wrong function ID or no access  
**Solution:** Use `invoke functions:list` to see available functions.

### Upload fails
**Cause:** File too large or invalid zip  
**Solution:** Check file size and ensure it's a valid zip or directory.

## Complete Command Reference

Run `invoke --help` to see all commands, or `invoke COMMAND --help` for specific command help.

### Available Commands
- **Configuration:** `config:set`, `config:show`, `config:clear`
- **Authentication:** `auth:whoami`
- **Projects:** `projects:list`
- **Functions:** `functions:list`, `functions:get`, `functions:create`, `functions:update`, `functions:delete`
- **Environment:** `functions:env:list`, `functions:env:set`, `functions:env:delete`
- **Retention:** `functions:retention:get`, `functions:retention:set`
- **Schedule:** `functions:schedule:get`, `functions:schedule:set`, `functions:schedule:disable`
- **Versions:** `functions:versions:list`, `functions:versions:upload`, `functions:versions:switch`, `functions:versions:delete`, `functions:versions:download`
- **Logs:** `functions:logs`
- **Keys:** `functions:key:show`, `functions:key:regenerate`
- **Execution:** `functions:invoke`, `functions:test`

## Getting Help

```bash
# General help
invoke --help

# Command-specific help
invoke functions:create --help
invoke functions:versions:upload --help
```

## Next Steps

1. ✅ Set up your API key
2. ✅ Create your first function
3. ✅ Test it with `functions:test`
4. 📚 Explore the full [README.md](./README.md) for detailed documentation
5. 🚀 Set up CI/CD integration for automatic deployments

Happy coding! 🎉

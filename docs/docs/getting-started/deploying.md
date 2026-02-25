# Deploying Functions

Learn how to package and deploy your Invoke functions.

## Deployment Methods

Invoke supports two deployment methods:

1. **Admin Panel** - Web-based upload (recommended for beginners)
2. **CLI** - Command-line deployment (recommended for automation)

## Preparing Your Function

### 1. Create Function Files

Your function needs at minimum:

- `index.js` - Main function file

```javascript
// index.js
module.exports = async function(req, res) {
    res.json({ message: 'Hello from Invoke!' });
};
```

### 2. Install Dependencies (Optional)

If your function uses npm packages:

```bash
npm install lodash axios
```

This creates a `node_modules/` directory that will be included in your package.

### 3. Create Function Package

Package your function as a zip file:

**Windows (PowerShell):**
```powershell
Compress-Archive -Path index.js,package.json,node_modules -DestinationPath function.zip
```

**Linux/Mac:**
```bash
zip -r function.zip index.js package.json node_modules
```

**Node.js Script:**
```javascript
const archiver = require('archiver');
const fs = require('fs');

const output = fs.createWriteStream('function.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(output);
archive.file('index.js', { name: 'index.js' });
archive.file('package.json', { name: 'package.json' });
archive.directory('node_modules/', 'node_modules');
archive.finalize();
```

## Deploying via Admin Panel

### Step 1: Access Admin Panel

Navigate to your Invoke admin panel:

```
http://localhost:3000
```

Log in with your admin credentials.

### Step 2: Select or Create Project

1. Select an existing project from the dropdown, or
2. Click **"Create Project"** to create a new one

### Step 3: Upload Function

1. Click **"Upload Function"** or **"New Function"**
2. Fill in the form:
   - **Function Name**: Unique identifier (e.g., "user-api")
   - **Description**: Brief description of what it does
   - **File**: Select your `function.zip`
3. Click **"Upload"** or **"Deploy"**

### Step 4: Configure (Optional)

After upload, you can configure:

- **Environment Variables**: Set env vars for your function
- **Memory Limit**: Adjust memory allocation
- **Timeout**: Set maximum execution time
- **Network Policy**: Control outbound network access

### Step 5: Test

Your function is now live! The admin panel shows your endpoint:

```
http://<your invoke-execution URL>/invoke/{functionId}
```

Test it:

```bash
curl http://<your invoke-execution URL>/invoke/{functionId}
```

## Deploying via CLI

### Prerequisites

Install and configure the Invoke CLI:

```bash
cd invoke-cli
npm install
```

Create an admin user if you haven't:

```bash
node index.js user:create
```

### Deploy Command

```bash
invoke function:deploy [path] --name <name> --project <project>
```

**Arguments:**
- `[path]` — Path to function directory or zip file (default: `.`)

**Required options:**
- `--name <name>` — Function name
- `--project <id>` — Project ID or name

**Options:**
- `--description <text>` — Function description (used on first creation only)
- `--requires-api-key` — Require API key for invocation (creation only)
- `--output <format>` — Output format: `table` or `json`

**Examples:**
```bash
# Deploy current directory
invoke function:deploy --name user-api --project "my-project"

# Deploy a specific path
invoke function:deploy ./my-function --name user-api --project "my-project" --description "User API function"

# Deploy a zip file
invoke function:deploy function.zip --name user-api --project "my-project"
```

## Versioning

Invoke automatically versions your functions:

### Uploading New Version

Simply upload a new zip file with the same function name:

1. Admin Panel: Follow the same upload process
2. CLI: Run the deploy command again

Each upload creates a new version (v1, v2, v3, etc.).

### Version Management

In the admin panel:

- **View Versions**: See all function versions
- **Activate Version**: Switch which version is active
- **Compare Versions**: View differences between versions
- **Rollback**: Activate a previous version

## Function Configuration

### Environment Variables

Set environment variables for your function:

**Admin Panel:**
1. Navigate to function
2. Click **"Environment Variables"**
3. Add key-value pairs
4. Click **"Save"**

**CLI:**
```bash
# Set environment variables using the env commands
invoke function:env:set my-function DATABASE_URL "postgresql://..."
invoke function:env:set my-function API_SECRET "abc123"
```

**Access in function:**
```javascript
module.exports = function(req, res) {
    const dbUrl = process.env.DATABASE_URL;
    const apiSecret = process.env.API_SECRET;
    
    res.json({ configured: true });
};
```

### Memory Limits

Memory limits are configured per-function in the admin panel:

1. Navigate to your function
2. Click **"Settings"**
3. Adjust **Memory Limit**
4. Save changes

### Timeout Settings

Execution timeouts are also configured in the admin panel:

1. Navigate to your function
2. Click **"Settings"**
3. Adjust **Timeout**
4. Save changes

## Network Policies

Control outbound network access for security:

**Admin Panel:**
1. Navigate to project
2. Click **"Network Policies"**
3. Configure allowed/blocked domains
4. Save changes

**Policies:**
- **Whitelist**: Allow only specific domains
- **Blacklist**: Block specific domains
- **Unrestricted**: Allow all (development only)

## Testing Deployments

### Using Invoke CLI

The easiest way to test your deployed functions is using the CLI:

#### function:invoke

Execute your function and see the response:

```bash
# Basic invocation
node index.js function:invoke my-function

# With query parameters
node index.js function:invoke my-function --query name=Alice --query age=30

# POST request with JSON body
node index.js function:invoke my-function \
  --method POST \
  --body '{"name":"Alice","age":30}'

# With custom headers
node index.js function:invoke my-function \
  --header "Authorization: Bearer token123" \
  --header "X-Custom-Header: value"

# POST with data file
node index.js function:invoke my-function \
  --method POST \
  --data ./request-data.json

# Access specific path
node index.js function:invoke my-function --path /users/123
```

#### function:test

Quick test with preset test cases:

```bash
# Run all test cases for a function
node index.js function:test my-function

# Run specific test case
node index.js function:test my-function --test-case "User Login"

# Interactive mode - choose test case
node index.js function:test my-function --interactive
```

**Benefits:**
- No need to construct URLs manually
- Automatically handles authentication
- Supports all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Easy to script and automate
- View formatted responses

### Using curl

```bash
# GET request
curl http://<your invoke-execution URL>/invoke/{functionId}

# GET with query parameters
curl "http://<your invoke-execution URL>/invoke/{functionId}?name=Alice&age=30"

# POST with JSON
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}' \
  http://<your invoke-execution URL>/invoke/{functionId}

# With API key (if required)
curl -H "X-API-Key: your-api-key" \
  http://<your invoke-execution URL>/invoke/{functionId}
```

### Using Postman/Insomnia

1. Create new request
2. Set URL: `http://<your invoke-execution URL>/invoke/{functionId}`
3. Set method: GET, POST, etc.
4. Add headers/body as needed
5. Send request

## Continuous Deployment

### GitHub Actions Example

```yaml
name: Deploy Invoke Function

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
        working-directory: ./my-function
      
      - name: Create package
        run: |
          cd my-function
          zip -r ../function.zip index.js package.json node_modules
      
      - name: Deploy to Invoke
        run: |
          npm install -g invoke-cli
          invoke function:deploy ./my-function \
            --name my-function \
            --project ${{ secrets.PROJECT_ID }}
        env:
          INVOKE_BASE_URL: ${{ secrets.INVOKE_API_URL }}
          INVOKE_API_KEY: ${{ secrets.INVOKE_API_KEY }}
```

## Best Practices

### 1. Version Control

Keep your function code in git:

```
my-function/
├── .gitignore
├── index.js
├── package.json
├── package-lock.json
└── README.md
```

`.gitignore`:
```
node_modules/
function.zip
*.log
.env
```

### 2. Testing Before Deploy

Test locally before deploying:

```javascript
// test.js
const handler = require('./index');

const mockReq = {
    method: 'GET',
    path: '/',
    query: { name: 'Test' },
    body: {},
    headers: {},
};

const mockRes = {
    json: (data) => console.log('Response:', data),
    send: (data) => console.log('Response:', data),
    status: (code) => mockRes,
};

handler(mockReq, mockRes);
```

### 3. Environment-Specific Configs

Use environment variables for different environments:

```javascript
module.exports = function(req, res) {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    
    res.json({ isProduction, apiUrl });
};
```

### 4. Keep Packages Small

- Only include necessary dependencies
- Use `.npmignore` to exclude dev dependencies
- Consider bundling for smaller packages

## Troubleshooting

### Deployment Fails

**Check:**
- Zip file contains `index.js` and `package.json`
- File names are correct (case-sensitive)
- Function exports a valid handler
- Dependencies are compatible with Node.js

### Function Fails at Runtime

**Check:**
- Execution logs in admin panel
- Network policy allows required domains
- Environment variables are set correctly
- Memory/timeout limits are adequate

### Viewing Logs

**Admin Panel:**
1. Navigate to function
2. Click **"Execution Logs"**
3. Filter by date/status
4. View detailed error messages

## Next Steps

- [API Reference](/docs/api/globals) - Learn available APIs
- [Examples](/docs/examples/hello-world) - See deployment examples
- [Best Practices](/docs/advanced/best-practices) - Deployment best practices

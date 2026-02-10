# Quick Start

Get started with Invoke by creating your first serverless function in under 5 minutes!

## Prerequisites

- Access to an Invoke instance (admin panel at http://localhost:3000)
- Basic knowledge of JavaScript/Node.js

## Step 1: Create a Project

1. Log in to the Invoke admin panel
2. Click **"Create Project"**
3. Enter a project name (e.g., "my-first-project")
4. Click **"Create"**

## Step 2: Create a Function

Create a new directory for your function:

```bash
mkdir hello-function
cd hello-function
```

Create an `index.js` file:

```javascript
module.exports = function(req, res) {
    res.json({
        message: 'Hello from Invoke!',
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path
    });
};
```

Create a `package.json` file:

```json
{
  "name": "hello-function",
  "version": "1.0.0",
  "main": "index.js"
}
```

## Step 3: Package Your Function

Create a zip file containing your function:

```bash
# On Windows (PowerShell)
Compress-Archive -Path index.js,package.json -DestinationPath function.zip

# On Linux/Mac
zip function.zip index.js package.json
```

## Step 4: Deploy via Admin Panel

1. In the admin panel, go to your project
2. Click **"Upload Function"**
3. Select your `function.zip` file
4. Enter a function name (e.g., "hello")
5. Click **"Deploy"**

## Step 5: Test Your Function

You'll receive an endpoint URL like:

```
http://localhost:3001/execute/{projectId}/{functionName}
```

Test it with curl:

```bash
curl http://localhost:3001/execute/{projectId}/hello
```

Response:

```json
{
  "message": "Hello from Invoke!",
  "timestamp": "2026-02-10T12:34:56.789Z",
  "method": "GET",
  "path": "/"
}
```

## Step 6: Make It Dynamic

Update your `index.js` to use query parameters:

```javascript
module.exports = function(req, res) {
    const name = req.query.name || 'World';
    const count = parseInt(req.query.count) || 1;
    
    const greetings = Array(count).fill(null).map(() => 
        `Hello, ${name}!`
    );
    
    res.json({
        greetings,
        timestamp: new Date().toISOString()
    });
};
```

Re-package and deploy (Invoke supports versioning):

```bash
# Create new zip
zip function.zip index.js package.json

# Upload as a new version in the admin panel
```

Test with parameters:

```bash
curl "http://localhost:3001/execute/{projectId}/hello?name=Alice&count=3"
```

Response:

```json
{
  "greetings": [
    "Hello, Alice!",
    "Hello, Alice!",
    "Hello, Alice!"
  ],
  "timestamp": "2026-02-10T12:35:00.123Z"
}
```

## Next Steps

🎉 Congratulations! You've created and deployed your first Invoke function.

Now explore:

- [Function Anatomy](/docs/getting-started/function-anatomy) - Understand function structure
- [Request Object](/docs/api/request) - Learn about `req` API
- [Response Object](/docs/api/response) - Learn about `res` API
- [Examples](/docs/examples/hello-world) - More example functions

## Using the CLI

Alternatively, you can use the Invoke CLI:

```bash
# Create admin user
cd invoke-cli
node index.js user:create

# Deploy a function (after setup)
node index.js function:deploy --project my-project --function hello-function
```

See the main README for CLI setup instructions.

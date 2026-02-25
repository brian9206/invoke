# Quick Start

Get started with Invoke by creating your first serverless function in under 5 minutes!

:::tip Using UI
Check out [Alternative: Deploy via Admin Panel](#alternative-deploy-via-admin-panel) section to learn more about deploying function with Web GUI.
:::

## Prerequisites

- Access to an Invoke instance (admin panel at http://localhost:3000)
- [Invoke CLI](/docs/cli/installation) installed: `npm install -g invoke-cli`
- Basic knowledge of JavaScript/Node.js

## Step 1: Create a Project

1. Log in to the Invoke admin panel
2. Click **"Create Project"**
3. Enter a project name (e.g., "Default Project")
4. Click **"Create"**

## Step 2: Configure the CLI

```bash
invoke config:set --api-key YOUR_API_KEY
invoke config:set --base-url http://localhost:3000
```

## Step 3: Scaffold Your Function

Use `invoke init` to create a new function directory with a ready-to-run hello world template:

```bash
invoke init hello-function \
  --name hello \
  --description "My first function" \
  --project "Default Project"
cd hello-function
```

This generates two files:

```
hello-function/
├── index.js       # Hello World handler
└── package.json   # Pre-configured with start/deploy/test scripts
```

The generated `index.js`:

```javascript
const crypto = require('crypto');

module.exports = async function(req, res) {
    const { name = 'World' } = req.query;

    res.setHeader('x-powered-by', 'Invoke');

    const resp = await fetch('http://httpbin.org/json');
    const fetchedData = await resp.json();

    res.json({
        message: `Hello, ${name}!`,
        name: {
            base64: Buffer.from(name).toString('base64'),
            sha256: crypto.createHash('sha256').update(name).digest('hex')
        },
        fetchedData,
        timestamp: Date.now()
    });
}
```

## Step 4: Deploy Your Function

```bash
invoke function:deploy --name hello --project "Default Project"
```

The CLI will:
1. Create the function record in your project (if it doesn't exist yet)
2. Package and upload the code
3. Automatically activate the function

Example output:
```
Function "hello" not found. Creating...
✅ Function created with ID: cd23cc1f-936f-445e-b2ba-dd8306b8dc01
Uploading code...
✅ Code uploaded as version 1
Activating...
✅ Function deployed successfully
```

## Step 5: Test Your Function

You'll receive an endpoint URL like:

```
http://<your invoke-execution URL>/invoke/{functionId}
```

Test it with curl:

```bash
curl "http://<your invoke-execution URL>/invoke/{functionId}?name=Alice"
```

Response:

```json
{
  "message": "Hello, Alice!",
  "name": {
    "base64": "QWxpY2U=",
    "sha256": "3bc51062973c458d5a6f2d8d64a023246354ad7e064b1e4e009ec8a0699a3043"
  },
  "fetchedData": { "...": "..." },
  "timestamp": 1740484496789
}
```

## Step 6: Iterate

Edit `index.js`, then redeploy — `function:deploy` is a smart upsert that creates a new version each time:

```bash
invoke function:deploy --name hello --project "Default Project"
```

Learn more in the [CLI Documentation](/docs/cli/installation).

## Next Steps

🎉 Congratulations! You've created and deployed your first Invoke function.

Now explore:

- [Function Anatomy](/docs/getting-started/function-anatomy) - Understand function structure
- [Request Object](/docs/api/request) - Learn about `req` API
- [Response Object](/docs/api/response) - Learn about `res` API
- [CLI Reference](/docs/cli/reference) - All available CLI commands
- [Examples](/docs/examples/hello-world) - More example functions

## Alternative: Deploy via Admin Panel

Prefer a UI? The admin panel can scaffold and deploy a Hello World function for you in one click — no local files or CLI needed.

### Step 1: Open the Deploy Page

Navigate to **Deploy** in the sidebar, or go to:
```
http://<your invoke-admin URL>/admin/deploy
```

### Step 2: Switch to "Create From Template"

At the top of the form, select the **Create From Template** tab (next to "Upload Package").

### Step 3: Fill in the Details

- **Function Name** *(required)* — e.g. `hello`
- **Description** *(optional)* — e.g. `My first function`
- **Require API key** *(optional)* — check if you want to protect the endpoint

### Step 4: Deploy

Click **Deploy**. Invoke will:
1. Generate a Hello World `index.js` and `package.json`
2. Package and upload them automatically
3. Activate the function immediately

You'll be redirected to the function detail page where you can view the endpoint URL, edit the code, and monitor executions.




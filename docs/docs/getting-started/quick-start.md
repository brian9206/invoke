import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Quick Start

Get started with Invoke by creating your first serverless function in under 5 minutes!

:::tip Using UI
Check out [Alternative: Deploy via Admin Panel](#alternative-deploy-via-admin-panel) section to learn more about deploying function with Web GUI.
:::

## Prerequisites

- Access to an Invoke instance (admin panel at http://localhost:3000)
- [Invoke CLI](/docs/cli/installation) installed: `npm install -g invoke-cli`
- For C# functions: .NET 10 SDK is **not** required locally — the platform compiles for you

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

Use `invoke init` to create a new function directory. The CLI prompts you to choose a language and template type:

```
$ invoke init hello-function
? Function name: hello
? Language: (Use arrow keys)
  ❯ JavaScript
    TypeScript
    C#
? Template: (Use arrow keys)
  ❯ Simple Function
    Multi-Route App
    Realtime Handler
```

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```bash
invoke init hello-function
cd hello-function
```

Generated files:

```
hello-function/
├── index.js
└── package.json
```

```javascript title="index.js"
import crypto from 'crypto'

export default async function handler(req, res) {
  const { name = 'World' } = req.query

  res.setHeader('x-powered-by', 'Invoke')

  const resp = await fetch('http://httpbin.org/json')
  const fetchedData = await resp.json()

  res.json({
    message: `Hello, ${name}!`,
    name: {
      base64: Buffer.from(name).toString('base64'),
      sha256: crypto.createHash('sha256').update(name).digest('hex')
    },
    fetchedData,
    timestamp: Date.now()
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```bash
invoke init hello-function
cd hello-function
```

Generated files:

```
hello-function/
├── index.ts
├── tsconfig.json
└── package.json
```

```typescript title="index.ts"
import crypto from 'crypto'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const name = (req.query.name as string) ?? 'World'

  res.setHeader('x-powered-by', 'Invoke')

  const resp = await fetch('http://httpbin.org/json')
  const fetchedData = await resp.json()

  res.json({
    message: `Hello, ${name}!`,
    name: {
      base64: Buffer.from(name).toString('base64'),
      sha256: crypto.createHash('sha256').update(name).digest('hex')
    },
    fetchedData,
    timestamp: Date.now()
  })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```bash
invoke init hello-function
cd hello-function
```

Generated files:

```
hello-function/
├── Function.cs
└── app.csproj
```

```csharp title="Function.cs"
using Invoke;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var name = req.Query.TryGetValue("name", out var n) ? n : "World";

        var nameBytes = Encoding.UTF8.GetBytes(name);
        var base64 = Convert.ToBase64String(nameBytes);
        var sha256 = Convert.ToHexString(SHA256.HashData(nameBytes)).ToLower();

        res.SetHeader("x-powered-by", "Invoke");
        res.Status(200).Json(new JsonObject
        {
            ["message"] = $"Hello, {name}!",
            ["name"] = new JsonObject
            {
                ["base64"] = base64,
                ["sha256"] = sha256
            },
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }
}
```

  </TabItem>
</Tabs>

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

:::note C# build time
C# functions are compiled to a Native AOT binary by the platform after upload. The first activation may take slightly longer while the build completes.
:::

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
  "timestamp": 1740484496789
}
```

## Step 6: Iterate

Edit your source file, then redeploy — `function:deploy` is a smart upsert that creates a new version each time:

```bash
invoke function:deploy --name hello --project "Default Project"
```

Learn more in the [CLI Documentation](/docs/cli/installation).

## Next Steps

🎉 Congratulations! You've created and deployed your first Invoke function.

Now explore:

- [Runtimes & Languages](/docs/getting-started/runtimes) - Language comparison and project structure
- [Function Anatomy](/docs/getting-started/function-anatomy) - Understand function structure
- [Bun API Reference](/docs/api/bun/request) - JS/TS `req` and `res` APIs
- [.NET API Reference](/docs/api/dotnet/request) - C# `InvokeRequest` and `InvokeResponse`
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

- **Function Name** _(required)_ — e.g. `hello`
- **Language** _(required)_ — JavaScript, TypeScript, or C#
- **Description** _(optional)_ — e.g. `My first function`
- **Require API key** _(optional)_ — check if you want to protect the endpoint

### Step 4: Deploy

Click **Deploy**. Invoke will:

1. Generate the Hello World template for your chosen language
2. Package and upload it automatically
3. Activate the function immediately

You'll be redirected to the function detail page where you can view the endpoint URL, edit the code, and monitor executions.

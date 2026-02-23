---
sidebar_position: 5
---

# Environment Variables

Manage environment variables for your functions using the Invoke CLI.

## Overview

Environment variables allow you to:
- Store configuration separately from code
- Keep secrets secure (API keys, database passwords)
- Use different values per environment (dev/staging/prod)
- Update configuration without redeploying code

## Listing Environment Variables

### List All Variables

```bash
invoke function:env:list my-api
```

**Example output:**
```
🔐 Environment Variables:

┌─────────────────┬──────────────────┬───────────────────────┐
│ Key             │ Value            │ Created               │
├─────────────────┼──────────────────┼───────────────────────┤
│ API_KEY         │ sk_test_abc123   │ 23/2/2026, 10:30:00 am│
│ DATABASE_URL    │ postgres://...   │ 23/2/2026, 10:30:05 am│
│ LOG_LEVEL       │ info             │ 23/2/2026, 11:45:22 am│
└─────────────────┴──────────────────┴───────────────────────┘
```

:::info
Long values are truncated in table view. Use `--output json` for full values.
:::

**JSON output:**
```bash
invoke function:env:list my-api --output json
```

## Setting Environment Variables

### Set a Variable

```bash
invoke function:env:set my-api API_KEY sk_live_xyz789
```

**Example output:**
```
✅ Environment variable set successfully
```

### Set Multiple Variables

```bash
invoke function:env:set my-api DATABASE_URL "postgres://user:pass@host/db"
invoke function:env:set my-api REDIS_URL "redis://localhost:6379"
invoke function:env:set my-api LOG_LEVEL "debug"
```

### Set from File

You can write a script to load variables from a `.env` file:

```bash
#!/bin/bash

# Read .env file and set each variable
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  
  # Set the variable
  invoke function:env:set my-api "$key" "$value"
done < .env
```

## Deleting Environment Variables

### Delete a Variable

```bash
invoke function:env:delete my-api API_KEY
```

You'll be prompted for confirmation:
```
? Are you sure you want to delete environment variable API_KEY? (y/N)
```

**Skip confirmation:**
```bash
invoke function:env:delete my-api API_KEY --force
```

## Using Environment Variables in Functions

### Accessing Variables

Environment variables are available via `process.env`:

```javascript
module.exports = async function(req, res) {
    const apiKey = process.env.API_KEY;
    const dbUrl = process.env.DATABASE_URL;
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    // Use the variables
    console.log('Log level:', logLevel);
    
    res.json({ 
        configured: !!apiKey && !!dbUrl 
    });
};
```

### Checking for Required Variables

```javascript
module.exports = async function(req, res) {
    const requiredVars = ['API_KEY', 'DATABASE_URL'];
    const missing = requiredVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        return res.status(500).json({
            error: 'Missing required environment variables',
            missing: missing
        });
    }
    
    // Continue with function logic...
};
```

## Environment Variable Workflows

### Development Setup

```bash
# Set development variables
invoke function:env:set my-api NODE_ENV "development"
invoke function:env:set my-api API_URL "http://localhost:8000"
invoke function:env:set my-api LOG_LEVEL "debug"
```

### Production Setup

```bash
# Set production variables
invoke function:env:set my-api NODE_ENV "production"
invoke function:env:set my-api API_URL "https://api.production.com"
invoke function:env:set my-api LOG_LEVEL "error"
```

### Secrets Management

For sensitive data like API keys:

```bash
# Set secret (value won't be logged)
invoke function:env:set my-api SECRET_KEY "$(openssl rand -hex 32)"

# Verify it's set (don't echo the value)
invoke function:env:list my-api | grep SECRET_KEY
```

### Configuration Update

Update a variable without redeploying:

```bash
# Update log level on the fly
invoke function:env:set my-api LOG_LEVEL "debug"

# Next invocation will use the new value
invoke function:invoke my-api
```

## Best Practices

### Naming Conventions

Use SCREAMING_SNAKE_CASE for environment variable names:

```bash
✅ Good
invoke function:env:set my-api DATABASE_URL "..."
invoke function:env:set my-api API_KEY "..."
invoke function:env:set my-api MAX_RETRIES "3"

❌ Bad
invoke function:env:set my-api databaseUrl "..."
invoke function:env:set my-api api-key "..."
invoke function:env:set my-api MaxRetries "3"
```

### Security

:::danger
Never commit sensitive values to version control!
:::

- Use environment variables for all secrets
- Rotate keys regularly
- Use different values per environment
- Limit who can view/modify production variables

### Organization

Group related variables with prefixes:

```bash
# Database configuration
invoke function:env:set my-api DB_HOST "localhost"
invoke function:env:set my-api DB_PORT "5432"
invoke function:env:set my-api DB_NAME "myapp"

# API configuration
invoke function:env:set my-api API_URL "https://api.example.com"
invoke function:env:set my-api API_KEY "sk_test_123"
invoke function:env:set my-api API_TIMEOUT "30000"

# Feature flags
invoke function:env:set my-api FEATURE_NEW_UI "true"
invoke function:env:set my-api FEATURE_BETA "false"
```

### Documentation

Document your environment variables:

```bash
# Create an .env.example file in your repo
DATABASE_URL=postgres://user:pass@host:5432/dbname
API_KEY=your_api_key_here
LOG_LEVEL=info
NODE_ENV=production
```

## Examples

### Database Configuration

```bash
invoke function:env:set my-api DB_HOST "localhost"
invoke function:env:set my-api DB_PORT "5432"
invoke function:env:set my-api DB_USER "myapp"
invoke function:env:set my-api DB_PASSWORD "secret123"
invoke function:env:set my-api DB_NAME "myapp_production"
```

**In your function:**
```javascript
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

module.exports = async function(req, res) {
    const result = await pool.query('SELECT NOW()');
    res.json({ time: result.rows[0].now });
};
```

### External API Integration

```bash
invoke function:env:set my-api STRIPE_API_KEY "sk_live_..."
invoke function:env:set my-api STRIPE_WEBHOOK_SECRET "whsec_..."
```

**In your function:**
```javascript
const stripe = require('stripe')(process.env.STRIPE_API_KEY);

module.exports = async function(req, res) {
    const session = await stripe.checkout.sessions.create({
        // ... session config
    });
    
    res.json({ sessionId: session.id });
};
```

### Feature Flags

```bash
invoke function:env:set my-api FEATURE_NEW_ALGORITHM "true"
invoke function:env:set my-api FEATURE_CACHE_ENABLED "true"
```

**In your function:**
```javascript
module.exports = async function(req, res) {
    const useNewAlgorithm = process.env.FEATURE_NEW_ALGORITHM === 'true';
    const cacheEnabled = process.env.FEATURE_CACHE_ENABLED === 'true';
    
    let result;
    if (useNewAlgorithm) {
        result = await newAlgorithm(req.body);
    } else {
        result = await oldAlgorithm(req.body);
    }
    
    if (cacheEnabled) {
        await kv.set(`result:${req.body.id}`, result, 3600);
    }
    
    res.json(result);
};
```

## Tips

### Bulk Export/Import

Export all variables:
```bash
invoke function:env:list my-api --output json > env-backup.json
```

### View Specific Variable

```bash
invoke function:env:list my-api --output json | grep "API_KEY"
```

### Validate Variables

Create a validation script:
```bash
#!/bin/bash

required_vars=("DATABASE_URL" "API_KEY" "LOG_LEVEL")

for var in "${required_vars[@]}"; do
    if ! invoke function:env:list my-api --output json | grep -q "$var"; then
        echo "Missing required variable: $var"
        exit 1
    fi
done

echo "All required variables are set!"
```

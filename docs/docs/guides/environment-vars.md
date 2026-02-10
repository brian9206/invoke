# Environment Variables Guide

Learn how to use environment variables in your Invoke functions.

## Accessing Environment Variables

```javascript
module.exports = function(req, res) {
    const apiKey = process.env.API_KEY;
    const debug = process.env.DEBUG === 'true';
    const port = parseInt(process.env.PORT) || 3000;
    
    res.json({ apiKey, debug, port });
};
```

## Setting via Admin Panel

1. Navigate to your function in the admin panel
2. Click "Environment Variables"
3. Add key-value pairs:
   - `API_KEY` = `your-secret-key`
   - `DEBUG` = `true`
   - `DATABASE_URL` = `postgresql://...`
4. Click "Save"

## Setting via CLI

```bash
node index.js function:deploy \
  --project my-project \
  --name my-function \
  --file function.zip \
  --env API_KEY=secret123 \
  --env DEBUG=true \
  --env MAX_RETRIES=3
```

## Common Patterns

### API Configuration

```javascript
module.exports = async function(req, res) {
    const apiUrl = process.env.API_URL || 'https://api.example.com';
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    
    const response = await fetch(`${apiUrl}/data`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`
        }
    });
    
    const data = await response.json();
    res.json(data);
};
```

### Database Connection

```javascript
module.exports = function(req, res) {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    };
    
    // Connect to database...
    res.json({ configured: true });
};
```

### Feature Flags

```javascript
module.exports = function(req, res) {
    const features = {
        newUI: process.env.FEATURE_NEW_UI === 'true',
        betaFeatures: process.env.FEATURE_BETA === 'true',
        maintenance: process.env.MAINTENANCE_MODE === 'true'
    };
    
    if (features.maintenance) {
        return res.status(503).json({ error: 'Under maintenance' });
    }
    
    res.json({ features });
};
```

### Environment-Specific Behavior

```javascript
module.exports = function(req, res) {
    const env = process.env.NODE_ENV || 'development';
    
    const config = {
        production: {
            apiUrl: 'https://api.production.com',
            debug: false,
            cacheTimeout: 3600000
        },
        development: {
            apiUrl: 'http://localhost:3000',
            debug: true,
            cacheTimeout: 0
        }
    };
    
    const settings = config[env];
    res.json(settings);
};
```

## Type Conversion

### Strings (default)

```javascript
const apiKey = process.env.API_KEY; // string
```

### Numbers

```javascript
const port = parseInt(process.env.PORT) || 3000;
const timeout = parseFloat(process.env.TIMEOUT) || 5.5;
```

### Booleans

```javascript
const debug = process.env.DEBUG === 'true';
const enabled = process.env.FEATURE_ENABLED !== 'false'; // true by default
```

### Arrays

```javascript
// ENV: ALLOWED_ORIGINS=http://localhost:3000,http://example.com
const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
```

### JSON

```javascript
// ENV: CONFIG={"key":"value","enabled":true}
const config = JSON.parse(process.env.CONFIG || '{}');
```

## Validation

```javascript
const requiredEnvVars = ['API_KEY', 'API_URL', 'DATABASE_URL'];

module.exports = function(req, res) {
    const missing = requiredEnvVars.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        return res.status(500).json({
            error: 'Missing required environment variables',
            missing
        });
    }
    
    // Proceed with function logic...
    res.json({ configured: true });
};
```

## Best Practices

### 1. Never Hardcode Secrets

```javascript
// ❌ DON'T
const apiKey = 'sk_live_abc123xyz';

// ✅ DO
const apiKey = process.env.API_KEY;
```

### 2. Provide Defaults

```javascript
const timeout = parseInt(process.env.TIMEOUT) || 30000;
const maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
```

### 3. Validate Critical Variables

```javascript
if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API_KEY required' });
}
```

### 4. Use Descriptive Names

```javascript
// ❌ Unclear
process.env.KEY
process.env.URL

// ✅ Clear
process.env.STRIPE_API_KEY
process.env.DATABASE_URL
```

### 5. Document Required Variables

Create a `.env.example` file:

```bash
# API Configuration
API_KEY=your-api-key-here
API_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Features (true/false)
DEBUG=false
FEATURE_NEW_UI=true
```

## Security Considerations

### Don't Log Sensitive Data

```javascript
// ❌ DON'T
console.log('API Key:', process.env.API_KEY);

// ✅ DO
console.log('API Key configured:', !!process.env.API_KEY);
```

### Don't Return Secrets in Responses

```javascript
// ❌ DON'T
res.json({ env: process.env });

// ✅ DO
res.json({ configured: !!process.env.API_KEY });
```

## Next Steps

- [Deploying Functions](/docs/getting-started/deploying) - Setting env vars during deployment
- [Best Practices](/docs/advanced/best-practices) - Security best practices
- [Examples](/docs/examples/hello-world) - Using env vars in examples

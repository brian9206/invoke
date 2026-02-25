# Cryptographic Hashing Example

Secure password hashing, data integrity, and verification.

## Password Hashing

```javascript
const crypto = require('crypto');

// Hash a password
function hashPassword(password) {
    // Generate a random salt
    const salt = crypto.randomBytes(16).toString('hex');
    
    // Hash password with salt using PBKDF2
    const hash = crypto.pbkdf2Sync(
        password,
        salt,
        100000,  // iterations
        64,      // key length
        'sha512' // digest
    ).toString('hex');
    
    // Return salt and hash
    return { salt, hash };
}

// Verify a password
function verifyPassword(password, salt, hash) {
    const testHash = crypto.pbkdf2Sync(
        password,
        salt,
        100000,
        64,
        'sha512'
    ).toString('hex');
    
    return testHash === hash;
}

module.exports = async function(req, res) {
    const { action, password, salt, hash } = req.body;
    
    if (action === 'hash') {
        if (!password) {
            return res.status(400).json({ error: 'Password required' });
        }
        
        const result = hashPassword(password);
        return res.json({
            success: true,
            salt: result.salt,
            hash: result.hash
        });
    }
    
    if (action === 'verify') {
        if (!password || !salt || !hash) {
            return res.status(400).json({ 
                error: 'Password, salt, and hash required' 
            });
        }
        
        const isValid = verifyPassword(password, salt, hash);
        return res.json({
            success: true,
            valid: isValid
        });
    }
    
    res.status(400).json({ error: 'Invalid action' });
};
```

### Testing

**Hash a password:**
```bash
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{"action":"hash","password":"mySecurePass123"}'
```

**Response:**
```json
{
  "success": true,
  "salt": "a1b2c3d4e5f6...",
  "hash": "9f8e7d6c5b4a..."
}
```

**Verify a password:**
```bash
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{
    "action":"verify",
    "password":"mySecurePass123",
    "salt":"a1b2c3d4e5f6...",
    "hash":"9f8e7d6c5b4a..."
  }'
```

## File Integrity Checking

```javascript
const crypto = require('crypto');

module.exports = async function(req, res) {
    const { action, data, hash: providedHash, algorithm } = req.body;
    
    if (action === 'hash') {
        // Generate hash for data
        const algo = algorithm || 'sha256';
        const hash = crypto.createHash(algo)
            .update(data)
            .digest('hex');
        
        return res.json({
            success: true,
            algorithm: algo,
            hash,
            data: data.substring(0, 50) + '...'
        });
    }
    
    if (action === 'verify') {
        // Verify data matches hash
        const algo = algorithm || 'sha256';
        const computedHash = crypto.createHash(algo)
            .update(data)
            .digest('hex');
        
        const isValid = computedHash === providedHash;
        
        return res.json({
            success: true,
            valid: isValid,
            algorithm: algo,
            providedHash,
            computedHash
        });
    }
    
    res.status(400).json({ error: 'Invalid action' });
};
```

### Testing

**Hash data:**
```bash
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{"action":"hash","data":"Important file contents","algorithm":"sha256"}'
```

**Verify integrity:**
```bash
curl -X POST http://<your invoke-execution URL>/invoke/{functionId} \
  -H "Content-Type: application/json" \
  -d '{
    "action":"verify",
    "data":"Important file contents",
    "hash":"...",
    "algorithm":"sha256"
  }'
```

## HMAC Authentication

```javascript
const crypto = require('crypto');

// Store API keys securely (use KV store in production)
const API_KEYS = {
    'user1': 'secret-key-1',
    'user2': 'secret-key-2'
};

function generateHMAC(message, secret) {
    return crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}

function verifyHMAC(message, signature, secret) {
    const expected = generateHMAC(message, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}

module.exports = function(req, res) {
    const userId = req.headers['x-user-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!userId || !signature || !timestamp) {
        return res.status(401).json({ 
            error: 'Missing authentication headers' 
        });
    }
    
    // Check timestamp (prevent replay attacks)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 300000) { // 5 minutes
        return res.status(401).json({ error: 'Request expired' });
    }
    
    // Verify HMAC
    const secret = API_KEYS[userId];
    if (!secret) {
        return res.status(401).json({ error: 'Invalid user' });
    }
    
    const message = `${req.method}:${req.path}:${timestamp}:${JSON.stringify(req.body)}`;
    
    try {
        const isValid = verifyHMAC(message, signature, secret);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Request is authenticated
        res.json({
            success: true,
            message: 'Authenticated request',
            userId,
            timestamp: new Date(requestTime).toISOString()
        });
        
    } catch (error) {
        res.status(401).json({ error: 'Verification failed' });
    }
};
```

### Client Example

```javascript
// Client-side code
const crypto = require('crypto');

function makeAuthenticatedRequest(userId, secret, path, method, body) {
    const timestamp = Date.now().toString();
    const message = `${method}:${path}:${timestamp}:${JSON.stringify(body)}`;
    
    const signature = crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    
    return fetch(`http://<your invoke-execution URL>/invoke/{functionId}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Signature': signature,
            'X-Timestamp': timestamp
        },
        body: JSON.stringify(body)
    });
}
```

## Unique ID Generation

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { type, count } = req.query;
    const num = parseInt(count) || 1;
    
    if (num > 100) {
        return res.status(400).json({ error: 'Max 100 IDs per request' });
    }
    
    const ids = [];
    
    for (let i = 0; i < num; i++) {
        let id;
        
        switch (type) {
            case 'uuid':
                // Generate UUID v4
                id = crypto.randomUUID();
                break;
                
            case 'hex':
                // Generate random hex string
                id = crypto.randomBytes(16).toString('hex');
                break;
                
            case 'base64':
                // Generate random base64 string
                id = crypto.randomBytes(16).toString('base64url');
                break;
                
            default:
                // Default to UUID
                id = crypto.randomUUID();
        }
        
        ids.push(id);
    }
    
    res.json({
        success: true,
        type: type || 'uuid',
        count: num,
        ids
    });
};
```

## Best Practices

### Password Security
- **Always salt passwords** - Never hash without a salt
- **Use PBKDF2, bcrypt, or Argon2** - Not plain SHA256
- **High iteration count** - At least 100,000 for PBKDF2
- **Never log passwords** - Even in error messages

### HMAC Security
- **Keep secrets secure** - Store in environment variables
- **Use timing-safe comparison** - Prevent timing attacks
- **Include timestamp** - Prevent replay attacks
- **Rotate keys regularly** - Have key rotation strategy

### General
- **Use crypto.randomBytes()** - For cryptographically secure random values
- **Don't roll your own crypto** - Use established algorithms
- **Keep crypto library updated** - Security patches matter

## Next Steps

- [Cryptography Guide](/docs/guides/cryptography) - More crypto patterns
- [Environment Variables](/docs/guides/environment-vars) - Store secrets
- [crypto Module](/docs/api/modules/crypto) - Full crypto API

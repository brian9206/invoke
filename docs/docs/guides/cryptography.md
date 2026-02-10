# Cryptography Guide

Learn how to use cryptographic functions in your Invoke functions.

## Hashing

### SHA-256 Hash

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const data = req.body.data || 'Hello World';
    
    const hash = crypto.createHash('sha256')
        .update(data)
        .digest('hex');
    
    res.json({ hash });
};
```

### Available Hash Algorithms

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const algorithms = crypto.getHashes();
    // ['sha1', 'sha256', 'sha512', 'md5', ...]
    
    res.json({ algorithms });
};
```

### Multiple Hashing Algorithms

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const data = 'secret data';
    
    const hashes = {
        md5: crypto.createHash('md5').update(data).digest('hex'),
        sha1: crypto.createHash('sha1').update(data).digest('hex'),
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        sha512: crypto.createHash('sha512').update(data).digest('hex')
    };
    
    res.json(hashes);
};
```

## HMAC (Message Authentication)

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const secret = process.env.HMAC_SECRET || 'my-secret-key';
    const message = req.body.message || 'Hello World';
    
    const hmac = crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    
    res.json({ message, hmac });
};
```

### Verify HMAC

```javascript
const crypto = require('crypto');

function verifyHMAC(message, receivedHMAC, secret) {
    const expectedHMAC = crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(receivedHMAC),
        Buffer.from(expectedHMAC)
    );
}

module.exports = function(req, res) {
    const { message, hmac } = req.body;
    const secret = process.env.HMAC_SECRET;
    
    const isValid = verifyHMAC(message, hmac, secret);
    
    res.json({ valid: isValid });
};
```

## Symmetric Encryption (AES)

### Encrypt Data

```javascript
const crypto = require('crypto');

function encrypt(text, password) {
    // Derive key from password
    const key = crypto. pbkdf2Sync(password, 'salt', 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
        encrypted,
        iv: iv.toString('hex')
    };
}

module.exports = function(req, res) {
    const { text, password } = req.body;
    const result = encrypt(text, password);
    res.json(result);
};
```

### Decrypt Data

```javascript
const crypto = require('crypto');

function decrypt(encrypted, password, ivHex) {
    const key = crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

module.exports = function(req, res) {
    const { encrypted, password, iv } = req.body;
    const decrypted = decrypt(encrypted, password, iv);
    res.json({ decrypted });
};
```

## Asymmetric Encryption (RSA)

### Generate Key Pair

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    
    res.json({ publicKey, privateKey });
};
```

### Encrypt with Public Key

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { data, publicKey } = req.body;
    
    const encrypted = crypto.publicEncrypt(
        publicKey,
        Buffer.from(data)
    );
    
    res.json({ encrypted: encrypted.toString('base64') });
};
```

### Decrypt with Private Key

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { encrypted, privateKey } = req.body;
    
    const decrypted = crypto.privateDecrypt(
        privateKey,
        Buffer.from(encrypted, 'base64')
    );
    
    res.json({ decrypted: decrypted.toString() });
};
```

## Digital Signatures

### Sign Data

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { data, privateKey } = req.body;
    
    const signature = crypto.sign(
        'sha256',
        Buffer.from(data),
        privateKey
    );
    
    res.json({ signature: signature.toString('base64') });
};
```

### Verify Signature

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    const { data, signature, publicKey } = req.body;
    
    const isValid = crypto.verify(
        'sha256',
        Buffer.from(data),
        publicKey,
        Buffer.from(signature, 'base64')
    );
    
    res.json({ valid: isValid });
};
```

## Random Data Generation

```javascript
const crypto = require('crypto');

module.exports = function(req, res) {
    // Random bytes
    const bytes = crypto.randomBytes(32).toString('hex');
    
    // Random UUID
    const uuid = crypto.randomUUID();
    
    // Random integer
    const randomInt = crypto.randomInt(1, 100);
    
    res.json({ bytes, uuid, randomInt });
};
```

## Password Hashing

```javascript
const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    
    return {
        salt,
        hash: hash.toString('hex')
    };
}

function verifyPassword(password, salt, storedHash) {
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    return hash.toString('hex') === storedHash;
}

module.exports = async function(req, res) {
    if (req.method === 'POST' && req.path === '/register') {
        const { password } = req.body;
        const { salt, hash } = hashPassword(password);
        
        // Store salt and hash...
        await kv.set('user:password', { salt, hash });
        
        res.json({ success: true });
    }
    
    if (req.method === 'POST' && req.path === '/login') {
        const { password } = req.body;
        const stored = await kv.get('user:password');
        
        const isValid = verifyPassword(password, stored.salt, stored.hash);
        
        res.json({ authenticated: isValid });
    }
};
```

## Best Practices

### 1. Use Strong Keys

```javascript
// ❌ Weak
const key = 'password123';

// ✅ Strong
const key = crypto.randomBytes(32);
```

### 2. Store Secrets Securely

```javascript
// ❌ Don't hardcode
const apiKey = 'hardcoded-secret';

// ✅ Use environment variables
const apiKey = process.env.API_KEY;
```

### 3. Use Appropriate Algorithms

```javascript
// For hashing: SHA-256 or better
// For encryption: AES-256
// For keys: RSA 2048+ bits
```

## Next Steps

- [Crypto Module](/docs/api/modules/crypto) - Complete API reference
- [Environment Variables](/docs/guides/environment-vars) - Secure secret storage
- [Examples](/docs/examples/crypto-hashing) - Crypto examples

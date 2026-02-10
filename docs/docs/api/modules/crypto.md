# crypto

The `crypto` module provides cryptographic functionality including hashing, HMAC, ciphers, decipher, signing, and verification. It's a comprehensive module for secure operations.

## Import

```javascript
const crypto = require('crypto');
```

## API Reference

### Hashing

#### crypto.createHash(algorithm[, options])

Creates and returns a Hash object for generating hash digests.

**Supported algorithms:** `'sha256'`, `'sha512'`, `'sha1'`, `'md5'`, `'sha384'`, `'sha224'`, etc.

#### hash.update(data[, inputEncoding])

Updates the hash content with the given data.

#### hash.digest([encoding])

Calculates the digest of all data passed. Encoding can be `'hex'`, `'base64'`, `'latin1'`, or `'buffer'`.

### HMAC

#### crypto.createHmac(algorithm, key[, options])

Creates and returns an HMAC object using the given algorithm and key.

#### hmac.update(data[, inputEncoding])

Updates the HMAC content with the given data.

#### hmac.digest([encoding])

Calculates the HMAC digest.

### Encryption/Decryption

#### crypto.createCipheriv(algorithm, key, iv[, options])

Creates and returns a Cipher object using the given algorithm, key, and initialization vector (iv).

**Common algorithms:** `'aes-256-cbc'`, `'aes-128-gcm'`, `'aes-256-gcm'`

#### cipher.update(data[, inputEncoding][, outputEncoding])

Updates the cipher with data.

#### cipher.final([outputEncoding])

Returns any remaining enciphered contents.

#### crypto.createDecipheriv(algorithm, key, iv[, options])

Creates and returns a Decipher object.

#### decipher.update(data[, inputEncoding][, outputEncoding])

Updates the decipher with data.

#### decipher.final([outputEncoding])

Returns any remaining deciphered contents.

### Random Data Generation

#### crypto.randomBytes(size[, callback])

Generates cryptographically strong pseudo-random data.

#### crypto.randomInt([min, ]max[, callback])

Generates a random integer.

#### crypto.randomUUID([options])

Generates a random RFC 4122 UUID.

### Key Derivation

#### crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)

Provides an asynchronous Password-Based Key Derivation Function 2 (PBKDF2) implementation.

#### crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)

Synchronous version of pbkdf2.

#### crypto.scrypt(password, salt, keylen[, options], callback)

Provides an asynchronous scrypt implementation.

#### crypto.scryptSync(password, salt, keylen[, options])

Synchronous version of scrypt.

### Digital Signatures

#### crypto.createSign(algorithm[, options])

Creates and returns a Sign object using the given algorithm.

#### sign.update(data[, inputEncoding])

Updates the Sign content with data.

#### sign.sign(privateKey[, outputEncoding])

Calculates the signature on all the data passed.

#### crypto.createVerify(algorithm[, options])

Creates and returns a Verify object.

#### verify.update(data[, inputEncoding])

Updates the Verify content with data.

#### verify.verify(object, signature[, signatureEncoding])

Verifies the provided data using the given object and signature.

### Key Generation

#### crypto.generateKeyPair(type, options, callback)

Generates a new asymmetric key pair.

#### crypto.generateKeyPairSync(type, options)

Synchronous version of generateKeyPair.

### Utilities

#### crypto.timingSafeEqual(a, b)

Compares two Buffer, TypedArray, or DataView instances using constant-time comparison.

#### crypto.getHashes()

Returns an array of supported hash algorithms.

#### crypto.getCiphers()

Returns an array of supported cipher algorithms.

## Examples

### SHA-256 Hashing

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const data = event.data || 'Hello, World!';
  
  // Create hash
  const hash = crypto.createHash('sha256');
  hash.update(data);
  const digest = hash.digest('hex');
  
  // Alternative: one-liner
  const quickHash = crypto.createHash('sha256').update(data).digest('hex');
  
  return {
    data,
    sha256: digest,
    quickHash,
    areEqual: digest === quickHash
  };
}
```

### Multiple Hash Algorithms

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const data = event.data || 'Sensitive information';
  
  const hashes = {
    md5: crypto.createHash('md5').update(data).digest('hex'),
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    sha384: crypto.createHash('sha384').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex')
  };
  
  return {
    data,
    hashes
  };
}
```

### HMAC for Message Authentication

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const message = event.message || 'Important message';
  const secret = process.env.HMAC_SECRET || 'my-secret-key';
  
  // Create HMAC
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const signature = hmac.digest('hex');
  
  // Verify HMAC
  function verifyHmac(message, signature, secret) {
    const expectedHmac = crypto.createHmac('sha256', secret)
      .update(message)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
  }
  
  const isValid = verifyHmac(message, signature, secret);
  
  return {
    message,
    signature,
    isValid
  };
}
```

### AES-256-CBC Encryption

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const plaintext = event.plaintext || 'Secret message';
  const password = process.env.ENCRYPTION_KEY || 'my-secret-password';
  
  // Derive key and IV from password
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(16);
  
  // Encrypt
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return {
    plaintext,
    encrypted,
    decrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    matches: plaintext === decrypted
  };
}
```

### AES-256-GCM Authenticated Encryption

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const plaintext = event.plaintext || 'Secret data';
  const password = process.env.ENCRYPTION_KEY || 'my-secret-password';
  
  // Derive key
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(12); // GCM recommended IV length
  
  // Encrypt with authentication
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Decrypt and verify
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return {
    plaintext,
    encrypted,
    decrypted,
    authTag: authTag.toString('hex'),
    verified: plaintext === decrypted
  };
}
```

### Random Data Generation

```javascript
const crypto = require('crypto');

export async function handler(event) {
  // Generate random bytes
  const randomBytes = crypto.randomBytes(16);
  const randomHex = randomBytes.toString('hex');
  const randomBase64 = randomBytes.toString('base64');
  
  // Generate random integers
  const randomInt = crypto.randomInt(1, 100);
  const randomInt2 = crypto.randomInt(1000);
  
  // Generate UUID
  const uuid = crypto.randomUUID();
  
  // Generate random token
  const token = crypto.randomBytes(32).toString('base64url');
  
  return {
    randomHex,
    randomBase64,
    randomInt,
    randomInt2,
    uuid,
    token
  };
}
```

### Password Hashing with PBKDF2

```javascript
const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

export async function handler(event) {
  const password = event.password || 'user-password';
  
  // Generate salt
  const salt = crypto.randomBytes(16);
  
  // Hash password
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha512';
  
  const hash = await pbkdf2Async(password, salt, iterations, keylen, digest);
  
  // Store these values
  const storedHash = hash.toString('hex');
  const storedSalt = salt.toString('hex');
  
  // Verify password
  async function verifyPassword(inputPassword, storedHash, storedSalt) {
    const salt = Buffer.from(storedSalt, 'hex');
    const hash = await pbkdf2Async(inputPassword, salt, iterations, keylen, digest);
    return hash.toString('hex') === storedHash;
  }
  
  const isValid = await verifyPassword(password, storedHash, storedSalt);
  
  return {
    storedHash,
    storedSalt,
    isValid
  };
}
```

### Password Hashing with scrypt

```javascript
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

export async function handler(event) {
  const password = event.password || 'secure-password';
  
  // Generate salt
  const salt = crypto.randomBytes(16);
  
  // Hash password with scrypt (recommended over PBKDF2)
  const hash = await scryptAsync(password, salt, 64);
  
  const storedHash = hash.toString('hex');
  const storedSalt = salt.toString('hex');
  
  // Verify password
  async function verifyPassword(inputPassword, storedHash, storedSalt) {
    const salt = Buffer.from(storedSalt, 'hex');
    const hash = await scryptAsync(inputPassword, salt, 64);
    return crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      hash
    );
  }
  
  const isValid = await verifyPassword(password, storedHash, storedSalt);
  
  return {
    storedHash,
    storedSalt,
    isValid
  };
}
```

### RSA Key Pair Generation

```javascript
const crypto = require('crypto');
const { promisify } = require('util');

const generateKeyPairAsync = promisify(crypto.generateKeyPair);

export async function handler(event) {
  // Generate RSA key pair
  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
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
  
  return {
    publicKey,
    privateKey,
    message: 'Keys generated successfully'
  };
}
```

### Digital Signature Creation and Verification

```javascript
const crypto = require('crypto');
const { promisify } = require('util');

const generateKeyPairAsync = promisify(crypto.generateKeyPair);

export async function handler(event) {
  const message = event.message || 'Important document';
  
  // Generate key pair
  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
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
  
  // Sign message
  const sign = crypto.createSign('sha256');
  sign.update(message);
  const signature = sign.sign(privateKey, 'hex');
  
  // Verify signature
  const verify = crypto.createVerify('sha256');
  verify.update(message);
  const isValid = verify.verify(publicKey, signature, 'hex');
  
  // Try with tampered message
  const tamperedMessage = message + ' (tampered)';
  const verify2 = crypto.createVerify('sha256');
  verify2.update(tamperedMessage);
  const isValidTampered = verify2.verify(publicKey, signature, 'hex');
  
  return {
    message,
    signature,
    isValid,
    tamperedMessage,
    isValidTampered
  };
}
```

### Secure Token Generation

```javascript
const crypto = require('crypto');

export async function handler(event) {
  // API key
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  // Session token
  const sessionToken = crypto.randomBytes(48).toString('base64url');
  
  // Reset token (shorter, time-limited)
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Verification code (6 digits)
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  
  return {
    apiKey,
    sessionToken,
    resetToken,
    verificationCode
  };
}
```

### File Hashing

```javascript
const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);

export async function handler(event) {
  const filePath = event.filePath || '/tmp/document.pdf';
  
  // Create test file
  await promisify(fs.writeFile)(filePath, 'File content here');
  
  // Read and hash file
  const fileBuffer = await readFile(filePath);
  
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  const checksum = hash.digest('hex');
  
  // Stream hashing for large files
  async function hashFileStream(path) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(path);
      
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  const checksumStream = await hashFileStream(filePath);
  
  return {
    filePath,
    checksum,
    checksumStream,
    match: checksum === checksumStream
  };
}
```

### Constant-Time Comparison

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const secret1 = 'my-secret-token-12345';
  const secret2 = 'my-secret-token-12345';
  const secret3 = 'my-secret-token-99999';
  
  // Convert to buffers
  const buf1 = Buffer.from(secret1);
  const buf2 = Buffer.from(secret2);
  const buf3 = Buffer.from(secret3);
  
  // Timing-safe comparison (prevents timing attacks)
  const equals12 = crypto.timingSafeEqual(buf1, buf2);
  const equals13 = crypto.timingSafeEqual(buf1, buf3);
  
  return {
    secret1EqualsSecret2: equals12,
    secret1EqualsSecret3: equals13
  };
}
```

### Encrypt/Decrypt with Password

```javascript
const crypto = require('crypto');

export async function handler(event) {
  const plaintext = event.plaintext || 'Secret data to protect';
  const password = event.password || 'user-password';
  
  function encrypt(text, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return salt + iv + encrypted data
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  }
  
  function decrypt(encryptedData, password) {
    const parts = encryptedData.split(':');
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = crypto.scryptSync(password, salt, 32);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  const encrypted = encrypt(plaintext, password);
  const decrypted = decrypt(encrypted, password);
  
  return {
    plaintext,
    encrypted,
    decrypted,
    success: plaintext === decrypted
  };
}
```

### List Available Algorithms

```javascript
const crypto = require('crypto');

export async function handler(event) {
  return {
    hashes: crypto.getHashes(),
    ciphers: crypto.getCiphers(),
    hashCount: crypto.getHashes().length,
    cipherCount: crypto.getCiphers().length
  };
}
```

## Security Best Practices

- **Never hardcode secrets** - use environment variables
- **Use strong algorithms** - prefer SHA-256+ for hashing, AES-256 for encryption
- **Use authenticated encryption** - prefer GCM modes over CBC
- **Generate strong random values** - use `crypto.randomBytes()` not `Math.random()`
- **Use timing-safe comparison** - use `crypto.timingSafeEqual()` for secret comparison
- **Salt your hashes** - always use unique salts for passwords
- **Use modern KDFs** - prefer scrypt or Argon2 over PBKDF2
- **Keep keys secure** - never log or expose private keys
- **Use sufficient iterations** - for PBKDF2, use at least 100,000 iterations

## Common Algorithms

### Hashing
- **SHA-256**: General purpose, widely supported
- **SHA-512**: More secure, larger output
- **SHA-1**: Deprecated, use for legacy compatibility only
- **MD5**: Broken, avoid for security purposes

### Encryption
- **AES-256-GCM**: Recommended, authenticated encryption
- **AES-256-CBC**: Common, but requires separate HMAC
- **AES-128-GCM**: Faster, still secure

### Key Derivation
- **scrypt**: Recommended for password hashing
- **PBKDF2**: Widely supported, legacy systems
- **Argon2**: Best security, limited Node.js support

## Next Steps

- [Buffer operations](./buffer.md)
- [HTTPS requests with certificates](./https.md)
- [Cryptography Guide](/docs/guides/cryptography)
- [Environment variables](./process.md)

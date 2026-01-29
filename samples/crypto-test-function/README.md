# Crypto Test Function

This function comprehensively tests the Node.js crypto module implementation in the Invoke VM environment.

## Phase 1 APIs Tested

### Random Number Generation
- `crypto.randomBytes(size)` - Generate cryptographically strong pseudo-random bytes
- `crypto.randomUUID()` - Generate RFC 4122 version 4 UUIDs
- `crypto.randomInt(min, max)` - Generate random integers

### Hashing
- `crypto.createHash(algorithm)` - Create Hash instances
- `hash.update(data, encoding)` - Update hash with data (chainable)
- `hash.digest(encoding)` - Compute digest as Buffer or string
- Supported algorithms: SHA-256, SHA-512, MD5, and all Node.js hash algorithms

### HMAC (Hash-based Message Authentication Code)
- `crypto.createHmac(algorithm, key)` - Create Hmac instances
- `hmac.update(data, encoding)` - Update HMAC with data (chainable)
- `hmac.digest(encoding)` - Compute HMAC as Buffer or string
- Support for both string and Buffer keys

### Password-Based Key Derivation (PBKDF2)
- `crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)` - Synchronous PBKDF2
- `crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)` - Asynchronous PBKDF2

### Utility Functions
- `crypto.getHashes()` - List all supported hash algorithms
- `crypto.constants` - Cryptographic constants

## Usage

Deploy this function to your Invoke instance and call it via HTTP:

```bash
curl http://your-invoke-instance/crypto-test-function
```

The function will return a JSON object with test results for all crypto APIs, including:
- Random value generation tests
- Hash computation verification (with known test vectors)
- HMAC authentication tests
- PBKDF2 key derivation tests
- Utility and constants tests

## Expected Output

```json
{
  "randomTests": {
    "randomBytes": { "length": 16, "type": "Buffer", "hex": "..." },
    "randomUUID": { "value": "...", "isValid": true },
    "randomInt": { "randomInt100": 42, "randomInt50to100": 73, "inRange": true }
  },
  "hashTests": {
    "sha256": { "input": "Hello, World!", "output": "dffd6021...", "expectedMatch": true },
    "chaining": { "output": "...", "chainingWorks": true }
  },
  "hmacTests": { ... },
  "pbkdf2Tests": { ... },
  "utilityTests": { ... }
}
```

## Notes

- All tests verify full Node.js compatibility
- Binary data is properly handled via Buffer/ArrayBuffer conversions
- Error handling matches Node.js behavior
- Async operations (pbkdf2) are fully supported with callbacks

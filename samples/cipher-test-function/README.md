# Cipher Test Function

This function comprehensively tests the Node.js crypto module Cipher and Decipher implementation in the Invoke VM environment (Phase 2).

## Phase 2 APIs Tested

### Cipher/Decipher Creation
- `crypto.createCipheriv(algorithm, key, iv)` - Create Cipher instances
- `crypto.createDecipheriv(algorithm, key, iv)` - Create Decipher instances

### Cipher Methods
- `cipher.update(data, inputEncoding, outputEncoding)` - Encrypt data chunks
- `cipher.final(outputEncoding)` - Finalize encryption
- `cipher.setAutoPadding(autoPadding)` - Control PKCS#7 padding
- `cipher.getAuthTag()` - Get authentication tag for AEAD modes (GCM)

### Decipher Methods
- `decipher.update(data, inputEncoding, outputEncoding)` - Decrypt data chunks
- `decipher.final(outputEncoding)` - Finalize decryption
- `decipher.setAutoPadding(autoPadding)` - Control PKCS#7 padding
- `decipher.setAuthTag(buffer)` - Set authentication tag for AEAD verification

### Utility Functions
- `crypto.getCiphers()` - List all supported cipher algorithms

## Test Coverage

### AES-256-CBC Tests
- Basic encryption/decryption roundtrip
- Verifies data integrity
- Tests Buffer concatenation pattern

### AES-128-GCM Tests (AEAD)
- Authenticated encryption with auth tags
- Auth tag verification on decryption
- Tamper detection (corrupted auth tag throws error)
- Proper AEAD workflow validation

### AES-256-CTR Tests
- Counter mode encryption
- Roundtrip verification

### Chunked Update Tests
- Multiple `update()` calls on same cipher
- Verifies streaming encryption pattern
- Tests `Buffer.concat()` usage

### Encoding Tests
- **hex** encoding for input/output
- **base64** encoding for input/output
- **Buffer** (binary) mode
- **utf8** text encoding

### Auto Padding Tests
- Default PKCS#7 padding (auto-padding enabled)
- No padding mode (requires exact block size)
- Verifies output is multiple of block size

### Error Cases
- Invalid algorithm name
- Invalid key size (AES-256 requires 32 bytes)
- Invalid IV size (CBC requires 16 bytes)
- Native error propagation

### Utility Functions
- `getCiphers()` returns array of supported algorithms
- Verifies common algorithms are available

## Usage

Deploy this function to your Invoke instance and call it via HTTP:

```bash
curl http://your-invoke-instance/cipher-test-function
```

## Expected Output

```json
{
  "cbcTests": {
    "roundtrip": {
      "plaintext": "Secret message for encryption testing!",
      "decrypted": "Secret message for encryption testing!",
      "match": true,
      "encryptedLength": 48,
      "encryptedHex": "..."
    }
  },
  "gcmTests": {
    "roundtrip": {
      "plaintext": "Authenticated encryption test data",
      "decrypted": "Authenticated encryption test data",
      "match": true,
      "authTagLength": 16,
      "authTagHex": "..."
    },
    "tamperDetection": {
      "detected": true,
      "errorMessage": "Unsupported state or unable to authenticate data"
    }
  },
  "chunkingTests": {
    "multipleUpdates": {
      "match": true,
      "chunkCount": 3
    }
  },
  "encodingTests": {
    "hex": { "match": true },
    "base64": { "match": true }
  },
  "paddingTests": { ... },
  "errorTests": {
    "invalidAlgorithm": { "caught": true },
    "invalidKeySize": { "caught": true },
    "invalidIvSize": { "caught": true }
  },
  "utilityTests": {
    "getCiphers": {
      "count": 100+,
      "isArray": true,
      "hasAES256CBC": true,
      "hasAES128GCM": true
    }
  }
}
```

## Key Concepts

### Cipher Algorithms
- **AES-128/192/256-CBC**: Block cipher with Cipher Block Chaining mode
- **AES-128/192/256-GCM**: AEAD cipher (Authenticated Encryption with Associated Data)
- **AES-128/192/256-CTR**: Counter mode (stream cipher)

### Key/IV Sizes
- **AES-128**: 16-byte key, 16-byte IV (CBC/CTR), 12-byte IV recommended (GCM)
- **AES-192**: 24-byte key, 16-byte IV (CBC/CTR), 12-byte IV recommended (GCM)
- **AES-256**: 32-byte key, 16-byte IV (CBC/CTR), 12-byte IV recommended (GCM)

### AEAD Workflow (GCM Mode)

**Encryption:**
```javascript
const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag(); // Get tag AFTER final()
// Send: encrypted + authTag
```

**Decryption:**
```javascript
const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
decipher.setAuthTag(authTag); // Set tag BEFORE update/final
const decrypted = Buffer.concat([
  decipher.update(encrypted),
  decipher.final() // Throws if auth tag doesn't match
]).toString('utf8');
```

## Notes

- All tests verify full Node.js crypto API compatibility
- Binary data properly handled via Buffer/ArrayBuffer conversions
- Error handling matches Node.js behavior
- Handle cleanup after `final()` prevents memory leaks
- GCM auth tag verification provides tamper detection

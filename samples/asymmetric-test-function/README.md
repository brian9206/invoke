# Asymmetric Cryptography Test Function

This function tests all asymmetric cryptography features exposed in the VM crypto module:

## Features Tested

### Key Generation
- **RSA**: 2048, 4096 bit keys (sync and async)
- **EC**: P-256, P-384, P-521 curves (sync and async)
- **Ed25519**: EdDSA keys (sync)

### Digital Signatures
- **Stateless**: `crypto.sign()` and `crypto.verify()`
- **Stateful**: `crypto.createSign()` and `crypto.createVerify()` classes
- **Algorithms**: SHA-256, SHA-384, SHA-512 with RSA/ECDSA
- **Encodings**: Buffer and hex output/input

### RSA Encryption
- **Public/Private**: `publicEncrypt()` and `privateDecrypt()`
- **Private/Public**: `privateEncrypt()` and `publicDecrypt()`
- **Padding**: PKCS1 (default) and OAEP

### Verification Tests
- Valid signature verification
- Tampered data rejection
- Encryption/decryption roundtrips
- Multi-chunk signing with `update()` calls

## Usage

Deploy this function and execute to see comprehensive test results for all asymmetric crypto operations.

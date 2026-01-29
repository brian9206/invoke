const crypto = require('crypto');

module.exports = async function(req, res) {
    const results = {
        cbcTests: {},
        gcmTests: {},
        ctrTests: {},
        chunkingTests: {},
        encodingTests: {},
        paddingTests: {},
        errorTests: {},
        utilityTests: {}
    };

    try {
        // ===== AES-256-CBC Tests =====
        console.log('Testing AES-256-CBC encryption/decryption...');
        
        const cbcKey = crypto.randomBytes(32); // 256 bits
        const cbcIv = crypto.randomBytes(16);  // 128 bits
        const plaintext = 'Secret message for encryption testing!';
        
        // Encrypt
        const cipher = crypto.createCipheriv('aes-256-cbc', cbcKey, cbcIv);
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final()
        ]);
        
        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-cbc', cbcKey, cbcIv);
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]).toString('utf8');
        
        results.cbcTests.roundtrip = {
            plaintext,
            decrypted,
            match: plaintext === decrypted,
            encryptedLength: encrypted.length,
            encryptedHex: encrypted.toString('hex')
        };

        // ===== AES-128-GCM Tests (AEAD) =====
        console.log('Testing AES-128-GCM with authentication...');
        
        const gcmKey = crypto.randomBytes(16); // 128 bits
        const gcmIv = crypto.randomBytes(12);  // 96 bits (recommended for GCM)
        const gcmPlaintext = 'Authenticated encryption test data';
        
        // Encrypt with GCM
        const gcmCipher = crypto.createCipheriv('aes-128-gcm', gcmKey, gcmIv);
        const gcmEncrypted = Buffer.concat([
            gcmCipher.update(gcmPlaintext, 'utf8'),
            gcmCipher.final()
        ]);
        const authTag = gcmCipher.getAuthTag();
        
        // Decrypt with GCM and verify auth tag
        const gcmDecipher = crypto.createDecipheriv('aes-128-gcm', gcmKey, gcmIv);
        gcmDecipher.setAuthTag(authTag);
        const gcmDecrypted = Buffer.concat([
            gcmDecipher.update(gcmEncrypted),
            gcmDecipher.final()
        ]).toString('utf8');
        
        results.gcmTests.roundtrip = {
            plaintext: gcmPlaintext,
            decrypted: gcmDecrypted,
            match: gcmPlaintext === gcmDecrypted,
            encryptedLength: gcmEncrypted.length,
            authTagLength: authTag.length,
            authTagHex: authTag.toString('hex')
        };
        
        // Test auth tag tampering detection
        try {
            const tamperDecipher = crypto.createDecipheriv('aes-128-gcm', gcmKey, gcmIv);
            const tamperedTag = Buffer.from(authTag);
            tamperedTag[0] ^= 0xFF; // Flip bits in first byte
            tamperDecipher.setAuthTag(tamperedTag);
            tamperDecipher.update(gcmEncrypted);
            tamperDecipher.final();
            results.gcmTests.tamperDetection = { detected: false, error: 'Should have thrown!' };
        } catch (err) {
            results.gcmTests.tamperDetection = {
                detected: true,
                errorMessage: err.message
            };
        }

        // ===== AES-256-CTR Tests =====
        console.log('Testing AES-256-CTR...');
        
        const ctrKey = crypto.randomBytes(32);
        const ctrIv = crypto.randomBytes(16);
        const ctrPlaintext = 'Counter mode encryption test';
        
        const ctrCipher = crypto.createCipheriv('aes-256-ctr', ctrKey, ctrIv);
        const ctrEncrypted = Buffer.concat([
            ctrCipher.update(ctrPlaintext, 'utf8'),
            ctrCipher.final()
        ]);
        
        const ctrDecipher = crypto.createDecipheriv('aes-256-ctr', ctrKey, ctrIv);
        const ctrDecrypted = Buffer.concat([
            ctrDecipher.update(ctrEncrypted),
            ctrDecipher.final()
        ]).toString('utf8');
        
        results.ctrTests.roundtrip = {
            plaintext: ctrPlaintext,
            decrypted: ctrDecrypted,
            match: ctrPlaintext === ctrDecrypted,
            encryptedLength: ctrEncrypted.length
        };

        // ===== Chunked Update Tests =====
        console.log('Testing chunked updates...');
        
        const chunkKey = crypto.randomBytes(32);
        const chunkIv = crypto.randomBytes(16);
        const chunks = ['First chunk, ', 'second chunk, ', 'third chunk!'];
        
        // Encrypt in chunks
        const chunkCipher = crypto.createCipheriv('aes-256-cbc', chunkKey, chunkIv);
        const encryptedChunks = chunks.map(chunk => chunkCipher.update(chunk, 'utf8'));
        encryptedChunks.push(chunkCipher.final());
        const chunkEncrypted = Buffer.concat(encryptedChunks);
        
        // Decrypt in one go
        const chunkDecipher = crypto.createDecipheriv('aes-256-cbc', chunkKey, chunkIv);
        const chunkDecrypted = Buffer.concat([
            chunkDecipher.update(chunkEncrypted),
            chunkDecipher.final()
        ]).toString('utf8');
        
        results.chunkingTests.multipleUpdates = {
            originalChunks: chunks,
            combined: chunks.join(''),
            decrypted: chunkDecrypted,
            match: chunks.join('') === chunkDecrypted,
            chunkCount: chunks.length
        };

        // ===== Encoding Tests =====
        console.log('Testing different encodings...');
        
        const encKey = crypto.randomBytes(32);
        const encIv = crypto.randomBytes(16);
        const encPlaintext = 'Encoding test data';
        
        // Hex encoding
        const hexCipher = crypto.createCipheriv('aes-256-cbc', encKey, encIv);
        const hexEncrypted = hexCipher.update(encPlaintext, 'utf8', 'hex') + hexCipher.final('hex');
        
        const hexDecipher = crypto.createDecipheriv('aes-256-cbc', encKey, encIv);
        const hexDecrypted = hexDecipher.update(hexEncrypted, 'hex', 'utf8') + hexDecipher.final('utf8');
        
        results.encodingTests.hex = {
            plaintext: encPlaintext,
            encrypted: hexEncrypted,
            decrypted: hexDecrypted,
            match: encPlaintext === hexDecrypted
        };
        
        // Base64 encoding
        const b64Cipher = crypto.createCipheriv('aes-256-cbc', encKey, encIv);
        const b64Encrypted = b64Cipher.update(encPlaintext, 'utf8', 'base64') + b64Cipher.final('base64');
        
        const b64Decipher = crypto.createDecipheriv('aes-256-cbc', encKey, encIv);
        const b64Decrypted = b64Decipher.update(b64Encrypted, 'base64', 'utf8') + b64Decipher.final('utf8');
        
        results.encodingTests.base64 = {
            plaintext: encPlaintext,
            encrypted: b64Encrypted,
            decrypted: b64Decrypted,
            match: encPlaintext === b64Decrypted
        };

        // ===== Auto Padding Tests =====
        console.log('Testing auto padding...');
        
        const padKey = crypto.randomBytes(32);
        const padIv = crypto.randomBytes(16);
        
        // With padding (default)
        const padCipher = crypto.createCipheriv('aes-256-cbc', padKey, padIv);
        const withPadding = Buffer.concat([
            padCipher.update('Short', 'utf8'),
            padCipher.final()
        ]);
        
        // Without padding (requires exact block size)
        const noPadCipher = crypto.createCipheriv('aes-256-cbc', padKey, padIv);
        noPadCipher.setAutoPadding(false);
        const exactBlock = Buffer.alloc(16, 'X'); // Exactly one block (128 bits)
        const noPadding = Buffer.concat([
            noPadCipher.update(exactBlock),
            noPadCipher.final()
        ]);
        
        results.paddingTests = {
            withPadding: {
                inputLength: 5,
                outputLength: withPadding.length,
                isMultipleOf16: withPadding.length % 16 === 0
            },
            withoutPadding: {
                inputLength: exactBlock.length,
                outputLength: noPadding.length,
                isMultipleOf16: noPadding.length % 16 === 0
            }
        };

        // ===== Error Cases =====
        console.log('Testing error cases...');
        
        // Invalid algorithm
        try {
            crypto.createCipheriv('invalid-algorithm', Buffer.alloc(32), Buffer.alloc(16));
            results.errorTests.invalidAlgorithm = { caught: false };
        } catch (err) {
            results.errorTests.invalidAlgorithm = {
                caught: true,
                message: err.message
            };
        }
        
        // Invalid key size
        try {
            crypto.createCipheriv('aes-256-cbc', Buffer.alloc(16), Buffer.alloc(16)); // Wrong key size
            results.errorTests.invalidKeySize = { caught: false };
        } catch (err) {
            results.errorTests.invalidKeySize = {
                caught: true,
                message: err.message
            };
        }
        
        // Invalid IV size
        try {
            crypto.createCipheriv('aes-256-cbc', Buffer.alloc(32), Buffer.alloc(8)); // Wrong IV size
            results.errorTests.invalidIvSize = { caught: false };
        } catch (err) {
            results.errorTests.invalidIvSize = {
                caught: true,
                message: err.message
            };
        }

        // ===== Utility Functions =====
        console.log('Testing utility functions...');
        
        const ciphers = crypto.getCiphers();
        results.utilityTests.getCiphers = {
            count: ciphers.length,
            isArray: Array.isArray(ciphers),
            hasAES256CBC: ciphers.includes('aes-256-cbc'),
            hasAES128GCM: ciphers.includes('aes-128-gcm'),
            hasAES256CTR: ciphers.includes('aes-256-ctr'),
            sample: ciphers.slice(0, 20)
        };

        console.log('All cipher tests completed successfully!');
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(results, null, 2)
        };

    } catch (error) {
        console.error('Error during cipher tests:', error);
        
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message,
                stack: error.stack,
                partialResults: results
            }, null, 2)
        };
    }
};

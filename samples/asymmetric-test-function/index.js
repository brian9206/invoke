const crypto = require('crypto');

module.exports = async function(req, res) {
    const results = [];
    const keys = {}; // Store keys locally instead of using global
    
    console.log('[ASYMMETRIC TEST] Starting...');
    results.push('[TEST START]');
    
    try {
        // ========== RSA KEY GENERATION ==========
        results.push('=== RSA Key Generation ===');
        console.log('[ASYMMETRIC TEST] Testing RSA generation...');
        
        // Test RSA-2048 key generation (sync)
        try {
            console.log('[ASYMMETRIC TEST] Calling generateKeyPairSync...');
            const { publicKey: rsaPub2048, privateKey: rsaPriv2048 } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
            });
            console.log('[ASYMMETRIC TEST] Key generation successful');
            results.push(`✓ RSA-2048 sync generation: ${rsaPub2048.substring(0, 50)}...`);
            
            // Store for later tests (reuse for all RSA tests to avoid slow key gen)
            keys.rsaPub2048 = rsaPub2048;
            keys.rsaPriv2048 = rsaPriv2048;
            keys.rsaPub4096 = rsaPub2048; // Reuse 2048 key
            keys.rsaPriv4096 = rsaPriv2048;
        } catch (err) {
            console.error('[ASYMMETRIC TEST] RSA generation error:', err);
            results.push(`✗ RSA-2048 sync generation failed: ${err.message}`);
            results.push(`Stack: ${err.stack}`);
        }
        
        // ========== EC KEY GENERATION ==========
        results.push('\n=== EC Key Generation ===');
        
        // Test EC P-256 key generation (sync)
        try {
            const { publicKey: ecPub256, privateKey: ecPriv256 } = crypto.generateKeyPairSync('ec', {
                namedCurve: 'P-256',
            });
            results.push(`✓ EC P-256 sync generation: ${ecPub256.substring(0, 50)}...`);
            keys.ecPub256 = ecPub256;
            keys.ecPriv256 = ecPriv256;
            keys.ecPub384 = ecPub256; // Reuse P-256 for testing
            keys.ecPriv384 = ecPriv256;
        } catch (err) {
            results.push(`✗ EC P-256 sync generation failed: ${err.message}`);
        }
        
        // ========== Ed25519 KEY GENERATION ==========
        results.push('\n=== Ed25519 Key Generation ===');
        
        try {
            const { publicKey: ed25519Pub, privateKey: ed25519Priv } = crypto.generateKeyPairSync('ed25519');
            results.push(`✓ Ed25519 sync generation: ${ed25519Pub.substring(0, 50)}...`);
            keys.ed25519Pub = ed25519Pub;
            keys.ed25519Priv = ed25519Priv;
        } catch (err) {
            results.push(`✗ Ed25519 sync generation failed: ${err.message}`);
        }
        
        // ========== STATELESS SIGN/VERIFY (RSA) ==========
        results.push('\n=== Stateless Sign/Verify (RSA) ===');
        
        if (keys.rsaPub2048 && keys.rsaPriv2048) {
            try {
                const data = Buffer.from('Test message for RSA signing');
                const signature = crypto.sign('sha256', data, keys.rsaPriv2048);
                results.push(`✓ RSA sign: ${signature.toString('hex').substring(0, 40)}...`);
                
                const isValid = crypto.verify('sha256', data, keys.rsaPub2048, signature);
                results.push(`✓ RSA verify valid: ${isValid}`);
                
                const tamperedData = Buffer.from('Tampered message');
                const isInvalid = crypto.verify('sha256', tamperedData, keys.rsaPub2048, signature);
                results.push(`✓ RSA verify tampered: ${!isInvalid ? 'correctly rejected' : 'ERROR: accepted tampered data'}`);
            } catch (err) {
                results.push(`✗ Stateless RSA sign/verify failed: ${err.message}`);
            }
        }
        
        // ========== STATELESS SIGN/VERIFY (EC) ==========
        results.push('\n=== Stateless Sign/Verify (EC) ===');
        
        if (keys.ecPub256 && keys.ecPriv256) {
            try {
                const data = Buffer.from('Test message for ECDSA signing');
                const signature = crypto.sign('sha256', data, keys.ecPriv256);
                results.push(`✓ ECDSA sign: ${signature.toString('hex').substring(0, 40)}...`);
                
                const isValid = crypto.verify('sha256', data, keys.ecPub256, signature);
                results.push(`✓ ECDSA verify valid: ${isValid}`);
                
                const tamperedData = Buffer.from('Tampered message');
                const isInvalid = crypto.verify('sha256', tamperedData, keys.ecPub256, signature);
                results.push(`✓ ECDSA verify tampered: ${!isInvalid ? 'correctly rejected' : 'ERROR: accepted tampered data'}`);
            } catch (err) {
                results.push(`✗ Stateless ECDSA sign/verify failed: ${err.message}`);
            }
        }
        
        // ========== STATELESS SIGN/VERIFY (Ed25519) ==========
        results.push('\n=== Stateless Sign/Verify (Ed25519) ===');
        
        if (keys.ed25519Pub && keys.ed25519Priv) {
            try {
                const data = Buffer.from('Test message for Ed25519 signing');
                const signature = crypto.sign(null, data, keys.ed25519Priv);
                results.push(`✓ Ed25519 sign: ${signature.toString('hex').substring(0, 40)}...`);
                
                const isValid = crypto.verify(null, data, keys.ed25519Pub, signature);
                results.push(`✓ Ed25519 verify valid: ${isValid}`);
                
                const tamperedData = Buffer.from('Tampered message');
                const isInvalid = crypto.verify(null, tamperedData, keys.ed25519Pub, signature);
                results.push(`✓ Ed25519 verify tampered: ${!isInvalid ? 'correctly rejected' : 'ERROR: accepted tampered data'}`);
            } catch (err) {
                results.push(`✗ Stateless Ed25519 sign/verify failed: ${err.message}`);
            }
        }
        
        // ========== SIGN CLASS (RSA) ==========
        results.push('\n=== Sign Class (RSA) ===');
        
        if (keys.rsaPub4096 && keys.rsaPriv4096) {
            try {
                const sign = crypto.createSign('sha256');
                sign.update('Part 1 ');
                sign.update('Part 2');
                const signature = sign.sign(keys.rsaPriv4096);
                results.push(`✓ Sign class update/sign: ${signature.toString('hex').substring(0, 40)}...`);
                
                const verify = crypto.createVerify('sha256');
                verify.update('Part 1 ');
                verify.update('Part 2');
                const isValid = verify.verify(keys.rsaPub4096, signature);
                results.push(`✓ Verify class update/verify: ${isValid}`);
            } catch (err) {
                results.push(`✗ Sign/Verify class failed: ${err.message}`);
            }
        }
        
        // ========== SIGN CLASS (EC) ==========
        results.push('\n=== Sign Class (EC) ===');
        
        if (keys.ecPub384 && keys.ecPriv384) {
            try {
                const sign = crypto.createSign('sha256');
                sign.update('Chunk 1 ');
                sign.update('Chunk 2 ');
                sign.update('Chunk 3');
                const signature = sign.sign(keys.ecPriv384);
                results.push(`✓ ECDSA Sign class: ${signature.toString('hex').substring(0, 40)}...`);
                
                const verify = crypto.createVerify('sha256');
                verify.update('Chunk 1 ');
                verify.update('Chunk 2 ');
                verify.update('Chunk 3');
                const isValid = verify.verify(keys.ecPub384, signature);
                results.push(`✓ ECDSA Verify class: ${isValid}`);
            } catch (err) {
                results.push(`✗ ECDSA Sign/Verify class failed: ${err.message}`);
            }
        }
        
        // ========== SIGN/VERIFY WITH ENCODINGS ==========
        results.push('\n=== Sign/Verify with Encodings ===');
        
        if (keys.rsaPub2048 && keys.rsaPriv2048) {
            try {
                const sign = crypto.createSign('sha256');
                sign.update('Test', 'utf8');
                const signature = sign.sign(keys.rsaPriv2048, 'hex');
                results.push(`✓ Sign with hex encoding: ${signature.substring(0, 40)}...`);
                
                const verify = crypto.createVerify('sha256');
                verify.update('Test', 'utf8');
                const isValid = verify.verify(keys.rsaPub2048, signature, 'hex');
                results.push(`✓ Verify with hex encoding: ${isValid}`);
            } catch (err) {
                results.push(`✗ Sign/Verify with encodings failed: ${err.message}`);
            }
        }
        
        // ========== RSA ENCRYPTION/DECRYPTION ==========
        results.push('\n=== RSA Encryption/Decryption ===');
        
        if (keys.rsaPub2048 && keys.rsaPriv2048) {
            try {
                const plaintext = Buffer.from('Secret message');
                const encrypted = crypto.publicEncrypt(keys.rsaPub2048, plaintext);
                results.push(`✓ Public encrypt: ${encrypted.toString('hex').substring(0, 40)}...`);
                
                const decrypted = crypto.privateDecrypt(keys.rsaPriv2048, encrypted);
                results.push(`✓ Private decrypt: ${decrypted.toString()} (matches: ${decrypted.equals(plaintext)})`);
            } catch (err) {
                results.push(`✗ RSA encryption/decryption failed: ${err.message}`);
            }
        }
        
        // ========== RSA ENCRYPTION WITH OAEP PADDING ==========
        results.push('\n=== RSA Encryption with OAEP Padding ===');
        
        if (keys.rsaPub4096 && keys.rsaPriv4096) {
            try {
                const plaintext = Buffer.from('Secret with OAEP');
                const encrypted = crypto.publicEncrypt({
                    key: keys.rsaPub4096,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
                }, plaintext);
                results.push(`✓ Public encrypt (OAEP): ${encrypted.toString('hex').substring(0, 40)}...`);
                
                const decrypted = crypto.privateDecrypt({
                    key: keys.rsaPriv4096,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
                }, encrypted);
                results.push(`✓ Private decrypt (OAEP): ${decrypted.toString()} (matches: ${decrypted.equals(plaintext)})`);
            } catch (err) {
                results.push(`✗ RSA OAEP encryption failed: ${err.message}`);
            }
        }
        
        // ========== PRIVATE ENCRYPT / PUBLIC DECRYPT ==========
        results.push('\n=== Private Encrypt / Public Decrypt ===');
        
        if (keys.rsaPub2048 && keys.rsaPriv2048) {
            try {
                const plaintext = Buffer.from('Signed data');
                const encrypted = crypto.privateEncrypt(keys.rsaPriv2048, plaintext);
                results.push(`✓ Private encrypt: ${encrypted.toString('hex').substring(0, 40)}...`);
                
                const decrypted = crypto.publicDecrypt(keys.rsaPub2048, encrypted);
                results.push(`✓ Public decrypt: ${decrypted.toString()} (matches: ${decrypted.equals(plaintext)})`);
            } catch (err) {
                results.push(`✗ Private encrypt / public decrypt failed: ${err.message}`);
            }
        }
        
        // ========== CONSTANTS CHECK ==========
        results.push('\n=== Constants Check ===');
        results.push(`✓ RSA_PKCS1_PADDING: ${crypto.constants.RSA_PKCS1_PADDING}`);
        results.push(`✓ RSA_PKCS1_OAEP_PADDING: ${crypto.constants.RSA_PKCS1_OAEP_PADDING}`);
        results.push(`✓ RSA_PKCS1_PSS_PADDING: ${crypto.constants.RSA_PKCS1_PSS_PADDING}`);
        
    } catch (err) {
        console.error('[ASYMMETRIC TEST] FATAL ERROR:', err);
        results.push(`\n✗ FATAL ERROR: ${err.message}`);
        results.push(err.stack);
    }
    
    const output = results.join('\n');
    console.log('[ASYMMETRIC TEST] Final output length:', output.length);
    console.log('[ASYMMETRIC TEST] Setting response...');
    res.status = 200;
    res.body = output;
    console.log('[ASYMMETRIC TEST] Response set, returning');
};

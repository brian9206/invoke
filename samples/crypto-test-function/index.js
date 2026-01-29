const crypto = require('crypto');

module.exports = async function(req, res) {
    const results = {
        randomTests: {},
        hashTests: {},
        hmacTests: {},
        pbkdf2Tests: {},
        errors: []
    };

    try {
        // ===== Random Functions Tests =====
        console.log('Testing random functions...');
        
        // Test randomBytes
        const randomBuf = crypto.randomBytes(16);
        results.randomTests.randomBytes = {
            length: randomBuf.length,
            type: Buffer.isBuffer(randomBuf) ? 'Buffer' : typeof randomBuf,
            hex: randomBuf.toString('hex')
        };
        
        // Test randomUUID
        const uuid = crypto.randomUUID();
        results.randomTests.randomUUID = {
            value: uuid,
            isValid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
        };
        
        // Test randomInt
        const randomNum1 = crypto.randomInt(100);
        const randomNum2 = crypto.randomInt(50, 100);
        results.randomTests.randomInt = {
            randomInt100: randomNum1,
            randomInt50to100: randomNum2,
            inRange: randomNum1 >= 0 && randomNum1 < 100 && randomNum2 >= 50 && randomNum2 < 100
        };

        // ===== Hash Tests =====
        console.log('Testing hash functions...');
        
        // Test SHA-256
        const sha256Hash = crypto.createHash('sha256');
        sha256Hash.update('Hello, World!');
        const sha256Result = sha256Hash.digest('hex');
        results.hashTests.sha256 = {
            input: 'Hello, World!',
            output: sha256Result,
            expectedMatch: sha256Result === 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f'
        };
        
        // Test SHA-512
        const sha512Hash = crypto.createHash('sha512');
        sha512Hash.update('Test');
        const sha512Result = sha512Hash.digest('hex');
        results.hashTests.sha512 = {
            input: 'Test',
            output: sha512Result,
            length: sha512Result.length
        };
        
        // Test MD5
        const md5Hash = crypto.createHash('md5');
        md5Hash.update('MD5 test');
        const md5Result = md5Hash.digest('hex');
        results.hashTests.md5 = {
            input: 'MD5 test',
            output: md5Result,
            length: md5Result.length
        };
        
        // Test chaining
        const chainedHash = crypto.createHash('sha256')
            .update('Part 1 ')
            .update('Part 2')
            .digest('hex');
        results.hashTests.chaining = {
            output: chainedHash,
            chainingWorks: true
        };
        
        // Test binary digest (Buffer)
        const binaryHash = crypto.createHash('sha256').update('Binary test').digest();
        results.hashTests.binaryDigest = {
            type: Buffer.isBuffer(binaryHash) ? 'Buffer' : typeof binaryHash,
            length: binaryHash.length,
            hex: binaryHash.toString('hex')
        };

        // ===== HMAC Tests =====
        console.log('Testing HMAC functions...');
        
        const hmacKey = 'secret-key';
        const hmac = crypto.createHmac('sha256', hmacKey);
        hmac.update('Data to authenticate');
        const hmacResult = hmac.digest('hex');
        results.hmacTests.sha256 = {
            key: hmacKey,
            data: 'Data to authenticate',
            output: hmacResult,
            length: hmacResult.length
        };
        
        // Test HMAC with Buffer key
        const bufferKey = Buffer.from('buffer-key', 'utf8');
        const hmacWithBufferKey = crypto.createHmac('sha256', bufferKey);
        hmacWithBufferKey.update('Test data');
        const hmacBufferResult = hmacWithBufferKey.digest('hex');
        results.hmacTests.withBufferKey = {
            output: hmacBufferResult,
            keyType: 'Buffer'
        };
        
        // Test HMAC chaining
        const chainedHmac = crypto.createHmac('sha256', 'key')
            .update('Part A ')
            .update('Part B')
            .digest('base64');
        results.hmacTests.chaining = {
            output: chainedHmac,
            encoding: 'base64'
        };

        // ===== PBKDF2 Tests =====
        console.log('Testing PBKDF2 functions...');
        
        // Test pbkdf2Sync
        const password = 'my-password';
        const salt = crypto.randomBytes(16);
        const iterations = 1000;
        const keylen = 32;
        const digest = 'sha256';
        
        const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
        results.pbkdf2Tests.sync = {
            password: password,
            saltLength: salt.length,
            iterations: iterations,
            keylen: keylen,
            digest: digest,
            derivedKeyLength: derivedKey.length,
            derivedKeyType: Buffer.isBuffer(derivedKey) ? 'Buffer' : typeof derivedKey,
            derivedKeyHex: derivedKey.toString('hex')
        };
        
        // Test async pbkdf2
        await new Promise((resolve, reject) => {
            crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
                if (err) {
                    results.errors.push({ test: 'pbkdf2_async', error: err.message });
                    reject(err);
                } else {
                    results.pbkdf2Tests.async = {
                        derivedKeyLength: derivedKey.length,
                        derivedKeyType: Buffer.isBuffer(derivedKey) ? 'Buffer' : typeof derivedKey,
                        derivedKeyHex: derivedKey.toString('hex'),
                        matchesSync: derivedKey.toString('hex') === results.pbkdf2Tests.sync.derivedKeyHex
                    };
                    resolve();
                }
            });
        });

        // ===== Utility Functions Tests =====
        console.log('Testing utility functions...');
        
        const hashes = crypto.getHashes();
        results.utilityTests = {
            getHashes: {
                count: hashes.length,
                hasSHA256: hashes.includes('sha256'),
                hasSHA512: hashes.includes('sha512'),
                hasMD5: hashes.includes('md5'),
                sample: hashes.slice(0, 10)
            }
        };

        // ===== Constants Tests =====
        results.constantsTests = {
            hasConstants: typeof crypto.constants === 'object',
            hasRSAPadding: typeof crypto.constants.RSA_PKCS1_PADDING === 'number'
        };

        console.log('All crypto tests completed successfully!');
        
        res.status(200).send({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(results, null, 2)
        });

    } catch (error) {
        console.error('Error during crypto tests:', error);
        results.errors.push({
            test: 'general',
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).send({
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(results, null, 2)
        });
    }
};

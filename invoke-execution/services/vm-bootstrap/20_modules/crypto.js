(function() {
    // Register module 'crypto'
    const self = {};
    builtinModule['crypto'] = self;

    // Hash class to wrap handle-based operations
    class Hash {
        constructor(algorithm) {
            this._handle = _crypto_createHash.applySync(undefined, [algorithm], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }

        update(data, inputEncoding) {
            this._handle = _crypto_hashUpdate.applySync(undefined, [this._handle, data, inputEncoding], { arguments: { copy: true } });
            return this; // Enable chaining
        }

        digest(encoding) {
            const result = _crypto_hashDigest.applySync(undefined, [this._handle, encoding], { arguments: { copy: true } });
            // Convert ArrayBuffer to Buffer if no encoding specified
            if (!encoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        copy() {
            // Create a new Hash with same algorithm
            // Node.js Hash.copy() creates a new hash with the same state
            // Since we can't easily copy state across VM boundary, create new hash
            throw new Error('Hash.copy() is not supported in VM environment');
        }
    }

    // Hmac class to wrap handle-based operations
    class Hmac {
        constructor(algorithm, key) {
            this._handle = _crypto_createHmac.applySync(undefined, [algorithm, key], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }

        update(data, inputEncoding) {
            this._handle = _crypto_hmacUpdate.applySync(undefined, [this._handle, data, inputEncoding], { arguments: { copy: true } });
            return this; // Enable chaining
        }

        digest(encoding) {
            const result = _crypto_hmacDigest.applySync(undefined, [this._handle, encoding], { arguments: { copy: true } });
            // Convert ArrayBuffer to Buffer if no encoding specified
            if (!encoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }
    }

    // Random functions
    self.randomBytes = function(size, callback) {
        if (callback) {
            // Async version with callback
            try {
                const result = Buffer.from(_crypto_randomBytes.applySync(undefined, [size], { arguments: { copy: true } }));
                // Call callback asynchronously
                setImmediate(() => callback(null, result));
            } catch (err) {
                setImmediate(() => callback(err));
            }
        } else {
            // Sync version
            return Buffer.from(_crypto_randomBytes.applySync(undefined, [size], { arguments: { copy: true } }));
        }
    };

    self.randomUUID = function(options) {
        // Node.js randomUUID supports options for disableEntropyCache
        // For now, ignore options and call the basic version
        return _crypto_randomUUID.applySync(undefined, [], { arguments: { copy: true } });
    };

    self.randomInt = function(min, max, callback) {
        // Handle overloads: randomInt(max), randomInt(min, max), randomInt(max, callback), randomInt(min, max, callback)
        let actualMin, actualMax, actualCallback;
        
        if (typeof max === 'function') {
            // randomInt(max, callback)
            actualMin = undefined;
            actualMax = min;
            actualCallback = max;
        } else if (typeof max === 'undefined') {
            // randomInt(max)
            actualMin = undefined;
            actualMax = min;
            actualCallback = undefined;
        } else if (typeof callback === 'function') {
            // randomInt(min, max, callback)
            actualMin = min;
            actualMax = max;
            actualCallback = callback;
        } else {
            // randomInt(min, max)
            actualMin = min;
            actualMax = max;
            actualCallback = undefined;
        }

        if (actualCallback) {
            // Async version
            try {
                const result = _crypto_randomInt.applySync(undefined, [actualMin, actualMax], { arguments: { copy: true } });
                setImmediate(() => actualCallback(null, result));
            } catch (err) {
                setImmediate(() => actualCallback(err));
            }
        } else {
            // Sync version
            return _crypto_randomInt.applySync(undefined, [actualMin, actualMax], { arguments: { copy: true } });
        }
    };

    // Hash and Hmac creation
    self.createHash = function(algorithm, options) {
        // options (like outputLength for shake algorithms) not yet supported
        return new Hash(algorithm);
    };

    self.createHmac = function(algorithm, key, options) {
        // options not yet supported
        return new Hmac(algorithm, key);
    };

    // Cipher class to wrap handle-based encryption operations
    class Cipher {
        constructor(algorithm, key, iv, options) {
            this._handle = _crypto_createCipheriv.applySync(undefined, [algorithm, key, iv, options], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }

        update(data, inputEncoding, outputEncoding) {
            const result = _crypto_cipherUpdate.applySync(undefined, [this._handle, data, inputEncoding, outputEncoding], { arguments: { copy: true } });
            
            // Convert ArrayBuffer to Buffer if no outputEncoding
            if (!outputEncoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        final(outputEncoding) {
            const result = _crypto_cipherFinal.applySync(undefined, [this._handle, outputEncoding], { arguments: { copy: true } });
            
            // Convert ArrayBuffer to Buffer if no outputEncoding
            if (!outputEncoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        setAutoPadding(autoPadding = true) {
            _crypto_cipherSetAutoPadding.applySync(undefined, [this._handle, autoPadding], { arguments: { copy: true } });
            return this;
        }

        getAuthTag() {
            const result = _crypto_cipherGetAuthTag.applySync(undefined, [this._handle], { arguments: { copy: true } });
            return Buffer.from(result);
        }
    }

    // Decipher class to wrap handle-based decryption operations
    class Decipher {
        constructor(algorithm, key, iv, options) {
            this._handle = _crypto_createDecipheriv.applySync(undefined, [algorithm, key, iv, options], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }

        update(data, inputEncoding, outputEncoding) {
            const result = _crypto_decipherUpdate.applySync(undefined, [this._handle, data, inputEncoding, outputEncoding], { arguments: { copy: true } });
            
            // Convert ArrayBuffer to Buffer if no outputEncoding
            if (!outputEncoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        final(outputEncoding) {
            const result = _crypto_decipherFinal.applySync(undefined, [this._handle, outputEncoding], { arguments: { copy: true } });
            
            // Convert ArrayBuffer to Buffer if no outputEncoding
            if (!outputEncoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        setAutoPadding(autoPadding = true) {
            _crypto_decipherSetAutoPadding.applySync(undefined, [this._handle, autoPadding], { arguments: { copy: true } });
            return this;
        }

        setAuthTag(buffer) {
            _crypto_decipherSetAuthTag.applySync(undefined, [this._handle, buffer], { arguments: { copy: true } });
            return this;
        }
    }
    
    // Sign class for creating digital signatures
    class Sign {
        constructor(algorithm) {
            this._handle = _crypto_createSign.applySync(undefined, [algorithm], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }
        
        update(data, inputEncoding) {
            this._handle = _crypto_signUpdate.applySync(undefined, [this._handle, data, inputEncoding], { arguments: { copy: true } });
            return this; // Enable chaining
        }
        
        sign(privateKey, outputEncoding) {
            const result = _crypto_signSign.applySync(undefined, [this._handle, privateKey, outputEncoding], { arguments: { copy: true } });
            // Convert ArrayBuffer to Buffer if no encoding specified
            if (!outputEncoding && result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }
    }
    
    // Verify class for verifying digital signatures
    class Verify {
        constructor(algorithm) {
            this._handle = _crypto_createVerify.applySync(undefined, [algorithm], { arguments: { copy: true } });
            this._algorithm = algorithm;
        }
        
        update(data, inputEncoding) {
            this._handle = _crypto_verifyUpdate.applySync(undefined, [this._handle, data, inputEncoding], { arguments: { copy: true } });
            return this; // Enable chaining
        }
        
        verify(publicKey, signature, signatureEncoding) {
            return _crypto_verifyVerify.applySync(undefined, [this._handle, publicKey, signature, signatureEncoding], { arguments: { copy: true } });
        }
    }

    // Cipher and Decipher creation
    self.createCipheriv = function(algorithm, key, iv, options) {
        return new Cipher(algorithm, key, iv, options);
    };

    self.createDecipheriv = function(algorithm, key, iv, options) {
        return new Decipher(algorithm, key, iv, options);
    };
    
    // Sign and Verify creation
    self.createSign = function(algorithm) {
        return new Sign(algorithm);
    };
    
    self.createVerify = function(algorithm) {
        return new Verify(algorithm);
    };
    
    // Key generation functions
    self.generateKeyPairSync = function(type, options) {
        return _crypto_generateKeyPairSync.applySync(undefined, [type, options], { arguments: { copy: true } });
    };
    
    self.generateKeyPair = function(type, options, callback) {
        // Wrap callback in ivm.Reference
        const wrappedCallback = new ivm.Reference((err, keyPair) => {
            if (err) {
                callback(err);
            } else {
                callback(null, keyPair.publicKey, keyPair.privateKey);
            }
        });
        
        _crypto_generateKeyPair.applySync(undefined, [type, options, wrappedCallback], { arguments: { copy: true } });
    };
    
    // Stateless sign/verify functions
    self.sign = function(algorithm, data, privateKey) {
        const result = _crypto_sign.applySync(undefined, [algorithm, data, privateKey], { arguments: { copy: true } });
        return Buffer.from(result);
    };
    
    self.verify = function(algorithm, data, publicKey, signature) {
        return _crypto_verify.applySync(undefined, [algorithm, data, publicKey, signature], { arguments: { copy: true } });
    };
    
    // Public/Private key encryption functions
    self.publicEncrypt = function(key, buffer) {
        const result = _crypto_publicEncrypt.applySync(undefined, [key, buffer], { arguments: { copy: true } });
        return Buffer.from(result);
    };
    
    self.privateDecrypt = function(key, buffer) {
        const result = _crypto_privateDecrypt.applySync(undefined, [key, buffer], { arguments: { copy: true } });
        return Buffer.from(result);
    };
    
    self.privateEncrypt = function(key, buffer) {
        const result = _crypto_privateEncrypt.applySync(undefined, [key, buffer], { arguments: { copy: true } });
        return Buffer.from(result);
    };
    
    self.publicDecrypt = function(key, buffer) {
        const result = _crypto_publicDecrypt.applySync(undefined, [key, buffer], { arguments: { copy: true } });
        return Buffer.from(result);
    };

    // pbkdf2
    self.pbkdf2 = function(password, salt, iterations, keylen, digest, callback) {
        // Wrap callback in ivm.Reference and convert ArrayBuffer to Buffer
        const wrappedCallback = new ivm.Reference((err, derivedKey) => {
            if (err) {
                callback(err);
            } else {
                callback(null, Buffer.from(derivedKey));
            }
        });
        
        _crypto_pbkdf2.applySync(undefined, [password, salt, iterations, keylen, digest, wrappedCallback], { arguments: { copy: true } });
    };

    self.pbkdf2Sync = function(password, salt, iterations, keylen, digest) {
        const result = _crypto_pbkdf2Sync.applySync(undefined, [password, salt, iterations, keylen, digest], { arguments: { copy: true } });
        return Buffer.from(result);
    };

    // Utility functions
    self.getHashes = function() {
        return _crypto_getHashes.applySync(undefined, [], { arguments: { copy: true } });
    };

    self.getCiphers = function() {
        return _crypto_getCiphers.applySync(undefined, [], { arguments: { copy: true } });
    };

    // Constants
    self.constants = {
        // SSL/TLS constants
        OPENSSL_VERSION_NUMBER: 0, // Placeholder, not available in VM
        SSL_OP_ALL: 0,
        SSL_OP_NO_SSLv2: 0,
        SSL_OP_NO_SSLv3: 0,
        SSL_OP_NO_TLSv1: 0,
        SSL_OP_NO_TLSv1_1: 0,
        SSL_OP_NO_TLSv1_2: 0,
        SSL_OP_NO_TLSv1_3: 0,
        
        // RSA padding constants
        RSA_PKCS1_PADDING: 1,
        RSA_SSLV23_PADDING: 2,
        RSA_NO_PADDING: 3,
        RSA_PKCS1_OAEP_PADDING: 4,
        RSA_X931_PADDING: 5,
        RSA_PKCS1_PSS_PADDING: 6,
        
        // Point conversion constants
        POINT_CONVERSION_COMPRESSED: 2,
        POINT_CONVERSION_UNCOMPRESSED: 4,
        POINT_CONVERSION_HYBRID: 6,
        
        // Default encoding
        defaultCoreCipherList: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256',
        defaultCipherList: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256'
    };
})();

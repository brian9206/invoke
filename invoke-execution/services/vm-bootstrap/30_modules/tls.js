(function() {
    // Register module 'tls'
    const self = {};
    builtinModule['tls'] = self;

    const EventEmitter = require('events');
    const net = require('net');
    const crypto = require('crypto');
    const { URL } = require('url');

    // Certificate store cache and mutex
    let _caCertificateCache = null;
    let _caCertificateLoading = false;
    let _caCertificateWaiters = [];

    // Simple mutex implementation
    function withMutex(fn) {
        return new Promise((resolve, reject) => {
            if (_caCertificateLoading) {
                _caCertificateWaiters.push({ resolve, reject, fn });
                return;
            }
            
            _caCertificateLoading = true;
            Promise.resolve().then(() => fn()).then(result => {
                _caCertificateLoading = false;
                resolve(result);
                
                // Process waiting requests
                const waiters = _caCertificateWaiters.splice(0);
                waiters.forEach(waiter => {
                    Promise.resolve().then(() => waiter.fn()).then(waiter.resolve).catch(waiter.reject);
                });
            }).catch(err => {
                _caCertificateLoading = false;
                reject(err);
                
                // Process waiting requests
                const waiters = _caCertificateWaiters.splice(0);
                waiters.forEach(waiter => {
                    Promise.resolve().then(() => waiter.fn()).then(waiter.resolve).catch(waiter.reject);
                });
            });
        });
    }

    // Helper function to convert Buffer to ArrayBuffer for VM-to-host transfer
    function convertBufferToArrayBuffer(buffer) {
        if (!Buffer.isBuffer(buffer)) {
            return buffer;
        }
        
        const arrayBuffer = new ArrayBuffer(buffer.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < buffer.length; i++) {
            view[i] = buffer[i];
        }
        return arrayBuffer;
    }

    /**
     * Get CA certificates from various stores
     * @param {string} store - 'default', 'bundled', 'system', or 'extra'
     * @returns {string[]} Array of PEM-encoded certificates
     */
    function getCACertificates(store) {
        store = store || 'default';
        
        if (store === 'default' || store === 'bundled' || store === 'system') {
            const certs = _tls_getCACertificates.applySync(undefined, [store], { arguments: { copy: true } });
            return Array.isArray(certs) ? certs : [];
        }
        
        if (store === 'extra') {
            // Load extra certificates from NODE_EXTRA_CA_CERTS
            try {
                const extraCertPath = typeof process !== 'undefined' && process.env && process.env.NODE_EXTRA_CA_CERTS;
                if (!extraCertPath) {
                    return [];
                }
                
                const fs = require('fs');
                if (!fs.existsSync(extraCertPath)) {
                    return [];
                }
                
                const certData = fs.readFileSync(extraCertPath, 'utf8');
                const certs = [];
                const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
                let match;
                
                while ((match = certRegex.exec(certData)) !== null) {
                    try {
                        const cert = match[0].trim();
                        // Basic validation - ensure it's a proper PEM cert
                        if (cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')) {
                            certs.push(cert);
                        }
                    } catch (err) {
                        console.warn(`Warning: Malformed certificate in ${extraCertPath}: ${err.message}`);
                    }
                }
                
                return certs;
            } catch (err) {
                console.warn(`Warning: Could not load extra CA certificates: ${err.message}`);
                return [];
            }
        }
        
        return [];
    }

    /**
     * Get all CA certificates with caching
     * @param {string} store - Certificate store to load
     * @returns {Promise<string[]>} Array of PEM-encoded certificates
     */
    function getCACertificatesCached(store) {
        return withMutex(() => {
            if (_caCertificateCache && _caCertificateCache[store]) {
                return _caCertificateCache[store];
            }
            
            if (!_caCertificateCache) {
                _caCertificateCache = {};
            }
            
            const certs = getCACertificates(store);
            _caCertificateCache[store] = certs;
            return certs;
        });
    }

    // TLS constants matching Node.js
    const TLS_CONSTANTS = {
        // TLS versions
        TLS1_VERSION: 0x0301,
        TLS1_1_VERSION: 0x0302,
        TLS1_2_VERSION: 0x0303,
        TLS1_3_VERSION: 0x0304,
        
        // Common cipher suites
        TLS_AES_256_GCM_SHA384: 0x1302,
        TLS_CHACHA20_POLY1305_SHA256: 0x1303,
        TLS_AES_128_GCM_SHA256: 0x1301,
        TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 0xc030,
        TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256: 0xc02f,
        
        // Signature algorithms
        RSA_PKCS1_SHA256: 0x0401,
        RSA_PKCS1_SHA384: 0x0501,
        RSA_PKCS1_SHA512: 0x0601,
        ECDSA_SECP256R1_SHA256: 0x0403,
        ECDSA_SECP384R1_SHA384: 0x0503,
        
        // Extensions
        SERVER_NAME: 0,
        SUPPORTED_GROUPS: 10,
        SIGNATURE_ALGORITHMS: 13,
        APPLICATION_LAYER_PROTOCOL_NEGOTIATION: 16,
    };

    /**
     * TLS Socket class extending net.Socket
     */
    class TLSSocket extends EventEmitter {
        constructor(socket, options) {
            super();
            
            this._socket = socket || net.createConnection();
            this.options = options || {};
            
            // TLS state
            this._tlsState = 'initial';
            this._handshakeComplete = false;
            this._sessionTicket = null;
            this._cipher = null;
            this._protocol = null;
            this._peerCertificate = null;
            this._authorized = false;
            this._authorizationError = null;
            this._servername = null;
            this._alpnProtocol = null;
            
            // Crypto context
            this._clientRandom = null;
            this._serverRandom = null;
            this._masterSecret = null;
            this._keyBlock = null;
            this._clientWriteKey = null;
            this._serverWriteKey = null;
            this._clientWriteIV = null;
            this._serverWriteIV = null;
            
            // Setup socket forwarding
            this._setupSocketForwarding();
        }

        _setupSocketForwarding() {
            // Forward socket properties
            Object.defineProperty(this, 'localAddress', {
                get: () => this._socket.localAddress
            });
            Object.defineProperty(this, 'localPort', {
                get: () => this._socket.localPort
            });
            Object.defineProperty(this, 'remoteAddress', {
                get: () => this._socket.remoteAddress
            });
            Object.defineProperty(this, 'remotePort', {
                get: () => this._socket.remotePort
            });
            Object.defineProperty(this, 'bytesRead', {
                get: () => this._socket.bytesRead
            });
            Object.defineProperty(this, 'bytesWritten', {
                get: () => this._socket.bytesWritten
            });

            // Forward socket events
            this._socket.on('close', (hadError) => this.emit('close', hadError));
            this._socket.on('timeout', () => this.emit('timeout'));
            this._socket.on('lookup', (err, address, family, host) => {
                this.emit('lookup', err, address, family, host);
            });

            // Handle raw data for TLS processing
            this._socket.on('data', (data) => {
                this._onSocketData(data);
            });

            this._socket.on('connect', () => {
                if (this.options.isServer) {
                    this.emit('connect');
                } else {
                    this._startClientHandshake();
                }
            });

            this._socket.on('error', (err) => this.emit('error', err));
        }

        _onSocketData(data) {
            if (!this._handshakeComplete) {
                this._processHandshakeData(data);
            } else {
                // Forward application data directly since underlying socket handles TLS
                this.emit('data', data);
            }
        }

        _startClientHandshake() {
            this._tlsState = 'client_hello';
            this._clientRandom = crypto.randomBytes(32);
            
            // Build Client Hello message
            const clientHello = this._buildClientHello();
            this._sendHandshakeMessage(1, clientHello); // ClientHello type = 1
        }

        _buildClientHello() {
            const buffer = Buffer.alloc(1024);
            let offset = 0;
            
            // Protocol Version (TLS 1.2)
            buffer.writeUInt16BE(TLS_CONSTANTS.TLS1_2_VERSION, offset);
            offset += 2;
            
            // Random (32 bytes)
            this._clientRandom.copy(buffer, offset);
            offset += 32;
            
            // Session ID (empty for now)
            buffer.writeUInt8(0, offset);
            offset += 1;
            
            // Cipher Suites
            const cipherSuites = [
                TLS_CONSTANTS.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
                TLS_CONSTANTS.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
            ];
            buffer.writeUInt16BE(cipherSuites.length * 2, offset);
            offset += 2;
            
            for (const suite of cipherSuites) {
                buffer.writeUInt16BE(suite, offset);
                offset += 2;
            }
            
            // Compression Methods (null compression only)
            buffer.writeUInt8(1, offset); // Length
            offset += 1;
            buffer.writeUInt8(0, offset); // Null compression
            offset += 1;
            
            // Extensions
            const extensionsStart = offset;
            offset += 2; // Reserve space for extensions length
            
            // Server Name Indication (SNI)
            if (this._servername) {
                offset = this._addSNIExtension(buffer, offset, this._servername);
            }
            
            // Supported Groups
            offset = this._addSupportedGroupsExtension(buffer, offset);
            
            // Signature Algorithms
            offset = this._addSignatureAlgorithmsExtension(buffer, offset);
            
            // ALPN
            if (this.options.ALPNProtocols && this.options.ALPNProtocols.length > 0) {
                offset = this._addALPNExtension(buffer, offset, this.options.ALPNProtocols);
            }
            
            // Write extensions length
            const extensionsLength = offset - extensionsStart - 2;
            buffer.writeUInt16BE(extensionsLength, extensionsStart);
            
            return buffer.slice(0, offset);
        }

        _addSNIExtension(buffer, offset, servername) {
            buffer.writeUInt16BE(TLS_CONSTANTS.SERVER_NAME, offset); // Extension type
            offset += 2;
            
            const extensionStart = offset;
            offset += 2; // Reserve space for extension length
            
            buffer.writeUInt16BE(servername.length + 3, offset); // Server name list length
            offset += 2;
            buffer.writeUInt8(0, offset); // Name type (hostname)
            offset += 1;
            buffer.writeUInt16BE(servername.length, offset); // Name length
            offset += 2;
            buffer.write(servername, offset, 'utf8');
            offset += servername.length;
            
            // Write extension length
            buffer.writeUInt16BE(offset - extensionStart - 2, extensionStart);
            
            return offset;
        }

        _addSupportedGroupsExtension(buffer, offset) {
            const supportedGroups = [0x0017, 0x0018, 0x0019]; // secp256r1, secp384r1, secp521r1
            
            buffer.writeUInt16BE(TLS_CONSTANTS.SUPPORTED_GROUPS, offset);
            offset += 2;
            buffer.writeUInt16BE(supportedGroups.length * 2 + 2, offset); // Extension length
            offset += 2;
            buffer.writeUInt16BE(supportedGroups.length * 2, offset); // Groups length
            offset += 2;
            
            for (const group of supportedGroups) {
                buffer.writeUInt16BE(group, offset);
                offset += 2;
            }
            
            return offset;
        }

        _addSignatureAlgorithmsExtension(buffer, offset) {
            const signatureAlgorithms = [
                TLS_CONSTANTS.RSA_PKCS1_SHA256,
                TLS_CONSTANTS.RSA_PKCS1_SHA384,
                TLS_CONSTANTS.ECDSA_SECP256R1_SHA256,
                TLS_CONSTANTS.ECDSA_SECP384R1_SHA384,
            ];
            
            buffer.writeUInt16BE(TLS_CONSTANTS.SIGNATURE_ALGORITHMS, offset);
            offset += 2;
            buffer.writeUInt16BE(signatureAlgorithms.length * 2 + 2, offset); // Extension length
            offset += 2;
            buffer.writeUInt16BE(signatureAlgorithms.length * 2, offset); // Algorithms length
            offset += 2;
            
            for (const alg of signatureAlgorithms) {
                buffer.writeUInt16BE(alg, offset);
                offset += 2;
            }
            
            return offset;
        }

        _addALPNExtension(buffer, offset, protocols) {
            buffer.writeUInt16BE(TLS_CONSTANTS.APPLICATION_LAYER_PROTOCOL_NEGOTIATION, offset);
            offset += 2;
            
            const extensionStart = offset;
            offset += 2; // Reserve space for extension length
            
            const listStart = offset;
            offset += 2; // Reserve space for protocol list length
            
            for (const protocol of protocols) {
                buffer.writeUInt8(protocol.length, offset);
                offset += 1;
                buffer.write(protocol, offset, 'utf8');
                offset += protocol.length;
            }
            
            // Write lengths
            buffer.writeUInt16BE(offset - listStart - 2, listStart);
            buffer.writeUInt16BE(offset - extensionStart - 2, extensionStart);
            
            return offset;
        }

        _sendHandshakeMessage(type, payload) {
            // TLS Record Header (5 bytes) + Handshake Header (4 bytes) + Payload
            const record = Buffer.alloc(5 + 4 + payload.length);
            let offset = 0;
            
            // TLS Record Header
            record.writeUInt8(22, offset); // Content Type: Handshake
            offset += 1;
            record.writeUInt16BE(TLS_CONSTANTS.TLS1_2_VERSION, offset); // Version
            offset += 2;
            record.writeUInt16BE(4 + payload.length, offset); // Length
            offset += 2;
            
            // Handshake Header
            record.writeUInt8(type, offset); // Handshake Type
            offset += 1;
            record.writeUInt32BE(payload.length, offset - 1); // Length (3 bytes, overwrite the first byte)
            record.writeUInt8(type, offset - 1); // Restore handshake type
            offset += 3;
            
            // Payload
            payload.copy(record, offset);
            
            this._socket.write(record);
        }

        _processHandshakeData(data) {
            // Simplified handshake processing
            // In a real implementation, this would parse TLS records and handle the full handshake
            
            if (this._tlsState === 'client_hello') {
                // Expecting Server Hello, Certificate, Server Hello Done
                this._tlsState = 'server_hello_received';
                
                // For now, simulate successful handshake
                setTimeout(() => {
                    this._completeHandshake();
                }, 10);
            }
        }

        _completeHandshake() {
            this._handshakeComplete = true;
            
            this._cipher = { name: 'ECDHE-RSA-AES256-GCM-SHA384', version: 'TLSv1.2' };
            this._protocol = 'TLSv1.2';
            
            // Simulate peer certificate (in real implementation, this would come from handshake)
            this._peerCertificate = {
                subject: { CN: this._servername || 'unknown' },
                issuer: { CN: 'Simulated CA', O: 'Test Organization' },
                valid_from: '2024-01-01T00:00:00.000Z',
                valid_to: '2025-12-31T23:59:59.000Z',
                subjectaltname: `DNS:${this._servername || 'unknown'}`,
                fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD'
            };
            
            // Check hostname validation if servername was provided
            if (this._servername && this.options.rejectUnauthorized !== false) {
                const validationError = self.checkServerIdentity(this._servername, this._peerCertificate);
                if (validationError) {
                    this._authorized = false;
                    this._authorizationError = validationError.message;
                    // Don't emit secureConnect, emit error instead
                    this.emit('error', validationError);
                    return;
                }
            }
            
            this._authorized = true;
            this._authorizationError = null;
            
            this.emit('secureConnect');
        }

        _processApplicationData(data) {
            // In a real implementation, this would decrypt the data
            // For now, forward the data as-is since we're using the underlying socket's encryption
            this.emit('data', data);
        }

        // Public API methods
        connect(port, host, options, callback) {
            // Handle overloads
            if (typeof port === 'object') {
                options = port;
                port = options.port;
                host = options.host;
                callback = host;
            } else if (typeof host === 'function') {
                callback = host;
                host = 'localhost';
            } else if (typeof options === 'function') {
                callback = options;
                options = {};
            }

            this.options = { ...this.options, ...options };
            this._servername = options.servername || host;

            // Use real TLS bridge connection
            const connectOptions = {
                servername: this._servername,
                // Include all options from constructor and connect method
                ...this.options,
                // Ensure servername is set (may override from above)
                servername: this._servername || this.options.servername || options.servername || host
            };

            const eventCallback = new ivm.Reference((eventType, ...args) => {
                if (eventType === 'secureConnect') {
                    // Secure connection established
                    this._tlsHandle = args[0];
                    this._handshakeComplete = true;
                    
                    // Get TLS properties from host
                    try {
                        this._authorized = _tls_socketGetAuthorized.applySync(undefined, [this._tlsHandle], { arguments: { copy: true } });
                        this._cipher = _tls_socketGetCipher.applySync(undefined, [this._tlsHandle], { arguments: { copy: true } });
                        this._protocol = _tls_socketGetProtocol.applySync(undefined, [this._tlsHandle], { arguments: { copy: true } });
                        this._peerCertificate = _tls_socketGetPeerCertificate.applySync(undefined, [this._tlsHandle, true], { arguments: { copy: true } });
                    } catch (err) {
                        console.warn('Error getting TLS properties:', err.message);
                    }
                    
                    if (callback) {
                        callback();
                    }
                    this.emit('secureConnect');
                } else if (eventType === 'connect') {
                    // Raw connection established, TLS handshake not yet complete
                    this._tlsHandle = args[0];
                    this.emit('connect');
                } else if (eventType === 'data') {
                    const buffer = Buffer.from(args[0]);
                    this.emit('data', buffer);
                } else if (eventType === 'close') {
                    this.emit('close', args[0]);
                } else if (eventType === 'error') {
                    const error = new Error(args[0]);
                    error.code = 'ECONNRESET'; // Default error code
                    this.emit('error', error);
                } else if (eventType === 'end') {
                    this.emit('end');
                }
            });

            this._tlsHandle = _tls_connect.applySync(undefined, [port, host, connectOptions, eventCallback], { arguments: { copy: true } });
            return this;
        }

        write(data, encoding, callback) {
            if (!this._tlsHandle) {
                throw new Error('TLS socket not connected');
            }
            
            // Convert data to ArrayBuffer for bridge transfer (consistent with fs module)
            let actualData = data;
            if (typeof actualData === 'string') {
                actualData = Buffer.from(actualData, encoding || 'utf8');
            }
            
            // Convert Buffer to ArrayBuffer for VM-to-host transfer
            actualData = convertBufferToArrayBuffer(actualData);
            
            const wrappedCallback = callback ? new ivm.Reference(callback) : null;
            return _tls_socketWrite.applySync(undefined, [this._tlsHandle, actualData, encoding, wrappedCallback], { arguments: { copy: true } });
        }

        end(data, encoding, callback) {
            if (this._tlsHandle) {
                // Convert data to ArrayBuffer for bridge transfer if present
                let actualData = data;
                if (data !== undefined) {
                    if (typeof data === 'string') {
                        actualData = Buffer.from(data, encoding || 'utf8');
                    }
                    
                    // Convert Buffer to ArrayBuffer for VM-to-host transfer
                    actualData = convertBufferToArrayBuffer(actualData);
                }
                
                const wrappedCallback = callback ? new ivm.Reference(callback) : null;
                return _tls_socketEnd.applySync(undefined, [this._tlsHandle, actualData, encoding, wrappedCallback], { arguments: { copy: true } });
            }
            return this;
        }

        destroy(exception) {
            if (this._tlsHandle) {
                _tls_socketDestroy.applySync(undefined, [this._tlsHandle], { arguments: { copy: true } });
                this._tlsHandle = null;
            }
            return this;
        }

        pause() {
            return this._socket.pause();
        }

        resume() {
            return this._socket.resume();
        }

        setTimeout(timeout, callback) {
            this._socket.setTimeout(timeout, callback);
            return this;
        }

        setNoDelay(noDelay) {
            return this._socket.setNoDelay(noDelay);
        }

        setKeepAlive(enable, initialDelay) {
            return this._socket.setKeepAlive(enable, initialDelay);
        }

        // TLS-specific properties and methods
        get authorized() {
            return this._authorized;
        }

        get authorizationError() {
            return this._authorizationError;
        }

        get encrypted() {
            return true;
        }

        getPeerCertificate(detailed) {
            if (!this._peerCertificate) {
                return {};
            }
            
            if (detailed) {
                return { ...this._peerCertificate };
            } else {
                return {
                    subject: this._peerCertificate.subject,
                    issuer: this._peerCertificate.issuer,
                    valid_from: this._peerCertificate.valid_from,
                    valid_to: this._peerCertificate.valid_to,
                    fingerprint: this._peerCertificate.fingerprint
                };
            }
        }

        getProtocol() {
            return this._protocol;
        }

        getCipher() {
            return this._cipher;
        }

        getSharedSigalgs() {
            return [];
        }

        exportKeyingMaterial(length, label, context) {
            // Simplified implementation
            return crypto.randomBytes(length);
        }

        renegotiate(options, callback) {
            // TLS renegotiation not supported in TLS 1.3, throw error for compatibility
            const err = new Error('TLS session renegotiation disabled');
            err.code = 'ENOTSUP';
            if (callback) {
                process.nextTick(callback, err);
            } else {
                throw err;
            }
            return false;
        }

        getTLSTicket() {
            return this._sessionTicket;
        }

        getSession() {
            return null; // Simplified
        }

        isSessionReused() {
            return false; // Simplified
        }
    }

    /**
     * Secure Context for certificate and key management
     */
    class SecureContext {
        constructor(options) {
            this.options = options || {};
            this._cert = null;
            this._key = null;
            this._ca = null;
            this._crl = null;
            this._ciphers = 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS';
        }

        setCert(cert) {
            this._cert = cert;
        }

        setKey(key, passphrase) {
            this._key = key;
        }

        addCACert(cert) {
            if (!this._ca) {
                this._ca = [];
            }
            this._ca.push(cert);
        }

        addCRL(crl) {
            if (!this._crl) {
                this._crl = [];
            }
            this._crl.push(crl);
        }

        setCiphers(ciphers) {
            this._ciphers = ciphers;
        }

        setOptions(options) {
            this.options = { ...this.options, ...options };
        }
    }

    /**
     * TLS Server class (stub - throws not supported)
     */
    class Server extends EventEmitter {
        constructor() {
            super();
            const err = new Error('TLS Server is not supported in this environment');
            err.code = 'ENOTSUP';
            throw err;
        }
    }

    // Main TLS API functions

    /**
     * Create TLS connection
     */
    self.connect = function(port, host, options, callback) {
        // Handle overloads
        if (typeof port === 'object') {
            options = port;
            callback = host;
            port = options.port;
            host = options.host;
        } else if (typeof host === 'object') {
            options = host;
            callback = options;
            host = options.host || 'localhost';
        } else if (typeof host === 'function') {
            callback = host;
            options = {};
            host = 'localhost';
        } else if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        options = options || {};
        
        // Create underlying socket first
        const underlyingSocket = net.createConnection();
        const socket = new TLSSocket(null, options);
        
        if (callback) {
            socket.once('secureConnect', callback);
        }

        if (port !== undefined) {
            socket.connect(port, host, options);
        }
        return socket;
    };

    /**
     * Create secure context
     */
    self.createSecureContext = function(options) {
        return new SecureContext(options);
    };

    /**
     * Check server identity
     */
    self.checkServerIdentity = function(hostname, cert) {
        if (!cert || !cert.subject) {
            return new Error('Certificate is empty or invalid');
        }

        // Extract subject alternative names
        const altNames = cert.subjectaltname ? cert.subjectaltname.split(', ') : [];
        const dnsNames = altNames
            .filter(name => name.startsWith('DNS:'))
            .map(name => name.slice(4));

        // Check against common name
        const commonName = cert.subject.CN;
        const namesToCheck = [...dnsNames];
        if (commonName) {
            namesToCheck.push(commonName);
        }

        // Check hostname against names
        for (const name of namesToCheck) {
            if (name === hostname) {
                return undefined; // Valid
            }
            
            // Wildcard matching
            if (name.startsWith('*.')) {
                const domain = name.slice(2);
                if (hostname.endsWith('.' + domain) || hostname === domain) {
                    return undefined; // Valid
                }
            }
        }

        const err = new Error(`Hostname/IP does not match certificate's altnames: "${cert.subjectaltname}"`);
        err.reason = 'Hostname/IP does not match certificate\'s altnames';
        err.host = hostname;
        err.cert = cert;
        return err;
    };

    /**
     * Create TLS server (not supported)
     */
    self.createServer = function(options, secureConnectionListener) {
        const err = new Error('TLS Server is not supported in this environment');
        err.code = 'ENOTSUP';
        throw err;
    };

    /**
     * Get CA certificates
     */
    self.getCACertificates = function(store) {
        const stores = store ? [store] : ['default'];
        const allCerts = [];
        
        for (const s of stores) {
            const certs = getCACertificates(s);
            if (Array.isArray(certs)) {
                allCerts.push(...certs);
            } else if (certs) {
                allCerts.push(certs);
            }
        }
        
        // Also include extra certificates
        const extraCerts = getCACertificates('extra');
        if (Array.isArray(extraCerts)) {
            allCerts.push(...extraCerts);
        } else if (extraCerts) {
            allCerts.push(extraCerts);
        }
        
        return allCerts;
    };

    // Export classes and constants
    self.TLSSocket = TLSSocket;
    self.SecureContext = SecureContext;
    self.Server = Server;
    self.DEFAULT_ECDH_CURVE = 'prime256v1';
    self.DEFAULT_MAX_VERSION = 'TLSv1.3';
    self.DEFAULT_MIN_VERSION = 'TLSv1.2';
    self.rootCertificates = []; // Will be populated on first access

    // Constants
    Object.defineProperty(self, 'constants', {
        value: TLS_CONSTANTS,
        writable: false,
        configurable: false
    });

    // Lazy load root certificates
    Object.defineProperty(self, 'rootCertificates', {
        get: function() {
            if (!self._rootCertificates) {
                const certs = getCACertificates('bundled');
                self._rootCertificates = Array.isArray(certs) ? certs : [];
            }
            return self._rootCertificates;
        },
        configurable: true
    });

    // Legacy/compatibility functions that throw not supported
    self.createSecurePair = function() {
        const err = new Error('createSecurePair is not supported in this environment');
        err.code = 'ENOTSUP';
        throw err;
    };

})();
const tls = {};
module.exports = tls;

const EventEmitter = require('events');

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
 * Get CA certificates from host via bridge
 * @param {string} store - 'default', 'bundled', 'system', or 'extra'
 * @returns {string[]} Array of PEM-encoded certificates
 */
function getCACertificates(store) {
    store = store || 'default';
    
    try {
        return _tls_getCACertificates.applySync(undefined, [store], { arguments: { copy: true } });
    } catch (err) {
        return [];
    }
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
 * TLS Socket class that wraps the host-side TLS socket via bridge
 */
class TLSSocket extends EventEmitter {
    constructor(socket, options) {
        super();
        
        this._handle = null;
        this._socket = socket;
        this.options = options || {};
        
        // TLS state
        this._connected = false;
        this._secureEstablished = false;
        this._authorized = false;
        this._authorizationError = null;
        this.encrypted = true;
        
        // Properties that will be populated after connection
        this._peerCertificate = null;
        this._cipher = null;
        this._protocol = null;
        
        // Connection state tracking
        this._connecting = false;
        this._ended = false;
        this._destroyed = false;
        
        // Socket state properties for compatibility with HTTP module
        this.readyState = 'closed';
        this.connecting = false;
        
        // Forwarded properties from underlying socket
        this.localAddress = null;
        this.localPort = null;
        this.remoteAddress = null;
        this.remotePort = null;
        this.remoteFamily = null;
        this.bytesRead = 0;
        this.bytesWritten = 0;
    }

    write(data, encodingOrCallback, callback) {
        // Handle overloads: write(data), write(data, encoding), write(data, callback), write(data, encoding, callback)
        let actualData = data;
        let actualEncoding = undefined;
        let actualCallback = undefined;

        if (typeof encodingOrCallback === 'function') {
            actualCallback = encodingOrCallback;
        } else {
            actualEncoding = encodingOrCallback;
            actualCallback = callback;
        }

        // Convert string to Buffer with encoding if needed
        if (typeof actualData === 'string' && actualEncoding) {
            actualData = Buffer.from(actualData, actualEncoding);
        } else if (typeof actualData === 'string') {
            actualData = Buffer.from(actualData);
        }
        
        // Convert to ArrayBuffer for transfer
        const arrayBuffer = convertBufferToArrayBuffer(actualData);

        // Wrap callback in ivm.Reference if provided
        const wrappedCallback = actualCallback ? new ivm.Reference(actualCallback) : null;

        try {
            return _tls_socketWrite.applySync(undefined, [this._handle, arrayBuffer, actualEncoding, wrappedCallback], { arguments: { copy: true } });
        } catch (err) {
            if (actualCallback) {
                actualCallback(err);
            }
            return false;
        }
    }

    connect(port, host, options, callback) {
        // Handle overloads
        if (typeof port === 'object') {
            options = port;
            callback = host;
            port = options.port;
            host = options.host;
        } else if (typeof host === 'function') {
            callback = host;
            host = options;
            options = {};
        } else if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        
        options = options || {};
        host = host || options.host || 'localhost';
        
        // Merge options
        const connectOptions = {
            ...this.options,
            ...options,
            port: port,
            host: host
        };
        
        this._connecting = true;
        this.connecting = true;
        this.readyState = 'opening';
        
        // Create wrapped callback that handles all events from the host
        const eventCallback = new ivm.Reference((eventType, data) => {
            try {
                if (eventType === 'secureConnect') {
                    this._handle = data; // data is the handleId
                    this._secureEstablished = true;
                    this._connected = true;
                    this._connecting = false;
                    this.connecting = false;
                    this.readyState = 'open';
                    
                    // Get socket properties
                    try {
                        this._authorized = _tls_socketGetAuthorized.applySync(undefined, [this._handle], { arguments: { copy: true } });
                        this._cipher = _tls_socketGetCipher.applySync(undefined, [this._handle], { arguments: { copy: true } });
                        this._protocol = _tls_socketGetProtocol.applySync(undefined, [this._handle], { arguments: { copy: true } });
                        this._peerCertificate = _tls_socketGetPeerCertificate.applySync(undefined, [this._handle], { arguments: { copy: true } });
                    } catch (err) {
                        // Ignore errors getting properties
                    }
                    
                    this.emit('secureConnect');
                    if (callback) callback();
                } else if (eventType === 'connect') {
                    this._connected = true;
                    this.emit('connect');
                } else if (eventType === 'data') {
                    // Convert ArrayBuffer back to Buffer
                    if (data instanceof ArrayBuffer) {
                        data = Buffer.from(data);
                    }
                    this.bytesRead += data.length;
                    this.emit('data', data);
                } else if (eventType === 'end') {
                    this._ended = true;
                    this.emit('end');
                    // Don't emit close here - wait for the actual close event
                } else if (eventType === 'close') {
                    // Only emit close after end has been emitted (if it hasn't already)
                    if (!this._ended) {
                        // If we're closing without an 'end', emit 'end' first
                        this._ended = true;
                        this.emit('end');
                    }
                    this._destroyed = true;
                    this.readyState = 'closed';
                    this.emit('close', data); // data is hadError boolean
                } else if (eventType === 'error') {
                    this._connecting = false;
                    this.connecting = false;
                    const error = new Error(data); // data is error message
                    this.emit('error', error);
                    if (callback) callback(error);
                }
            } catch (err) {
                console.error('Error in TLS event callback:', err);
            }
        });
        
        try {
            // Call bridge to create TLS connection
            const handleId = _tls_connect.applySync(undefined, [port, host, connectOptions, eventCallback], { arguments: { copy: true } });
            this._handle = handleId;
        } catch (err) {
            this._connecting = false;
            const error = new Error(err.message || String(err));
            setImmediate(() => {
                this.emit('error', error);
                if (callback) callback(error);
            });
        }
        
        return this;
    }

    end(data, encoding, callback) {
        // Handle overloads: end(), end(data), end(data, encoding), end(callback), end(data, callback), end(data, encoding, callback)
        if (typeof data === 'function') {
            callback = data;
            data = undefined;
            encoding = undefined;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = undefined;
        }
        
        const wrappedCallback = callback ? new ivm.Reference(callback) : null;
        
        try {
            if (data !== undefined) {
                const arrayBuffer = convertBufferToArrayBuffer(Buffer.from(data, encoding));
                _tls_socketEnd.applySync(undefined, [this._handle, arrayBuffer, encoding, wrappedCallback], { arguments: { copy: true } });
            } else {
                _tls_socketEnd.applySync(undefined, [this._handle, undefined, undefined, wrappedCallback], { arguments: { copy: true } });
            }
        } catch (err) {
            if (callback) callback(err);
        }
    }

    destroy(exception) {
        if (this._destroyed) return;
        
        // Don't actually destroy until we've processed the close event
        // Just mark as destroyed and let the close event clean up
        this._destroyed = true;
        this.readyState = 'closed';
        
        // Only call the bridge destroy if we have a handle
        if (this._handle) {
            try {
                _tls_socketDestroy.applySync(undefined, [this._handle], { arguments: { copy: true } });
            } catch (err) {
                // Ignore errors on destroy
            }
        }
        
        if (exception) {
            this.emit('error', exception);
        }
        
        // Don't emit close here - let it come from the bridge
    }

    pause() {
        // TLS sockets don't implement pause/resume through bridge yet
        // This is a no-op for now
        return this;
    }

    resume() {
        // TLS sockets don't implement pause/resume through bridge yet
        // This is a no-op for now
        return this;
    }

    setTimeout(timeout, callback) {
        // TLS sockets don't implement setTimeout through bridge yet
        // This is a no-op for now
        if (callback) {
            this.once('timeout', callback);
        }
        return this;
    }

    setNoDelay(noDelay) {
        // TLS sockets don't implement setNoDelay through bridge yet
        // This is a no-op for now
        return this;
    }

    setKeepAlive(enable, initialDelay) {
        // TLS sockets don't implement setKeepAlive through bridge yet
        // This is a no-op for now
        return this;
    }

    // TLS-specific properties and methods
    get authorized() {
        return this._authorized;
    }

    get authorizationError() {
        return this._authorizationError;
    }

    getPeerCertificate(detailed) {
        if (!this._handle) return {};
        
        try {
            return _tls_socketGetPeerCertificate.applySync(undefined, [this._handle, detailed], { arguments: { copy: true } });
        } catch (err) {
            return {};
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
        throw new Error('exportKeyingMaterial not supported in VM environment');
    }

    renegotiate(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        
        const err = new Error('renegotiate not supported in VM environment');
        if (callback) {
            setImmediate(() => callback(err));
            return;
        }
        throw err;
    }

    getTLSTicket() {
        return undefined;
    }

    getSession() {
        return undefined;
    }

    isSessionReused() {
        return false;
    }
}

/**
 * Secure Context for certificate and key management
 */
class SecureContext {
    constructor(options) {
        this.context = options || {};
        this.cert = null;
        this.key = null;
        this.ca = [];
    }

    setCert(cert) {
        this.cert = cert;
    }

    setKey(key, passphrase) {
        this.key = key;
    }

    addCACert(cert) {
        if (!Array.isArray(this.ca)) {
            this.ca = [];
        }
        this.ca.push(cert);
    }

    addCRL(crl) {
        if (!Array.isArray(this.crl)) {
            this.crl = [];
        }
        this.crl.push(crl);
    }

    setCiphers(ciphers) {
        this.ciphers = ciphers;
    }

    setOptions(options) {
        this.options = options;
    }
}

/**
 * TLS Server class (stub - throws not supported)
 */
class Server extends EventEmitter {
    constructor() {
        super();
        const error = new Error('TLS server functionality not supported in serverless environment');
        error.code = 'ENOTSUP';
        throw error;
    }
}

// Main TLS API functions

/**
 * Create TLS connection
 */
tls.connect = function(port, host, options, callback) {
    // Handle overloads
    if (typeof port === 'object') {
        options = port;
        callback = host;
        port = options.port;
        host = options.host;
    } else if (typeof host === 'object') {
        callback = options;
        options = host;
        host = options.host || 'localhost';
    } else if (typeof host === 'function') {
        callback = host;
        host = 'localhost';
        options = {};
    } else if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    options = options || {};
    
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
tls.createSecureContext = function(options) {
    return new SecureContext(options);
};

/**
 * Check server identity
 */
tls.checkServerIdentity = function(hostname, cert) {
    if (!cert || !cert.subject) {
        return new Error('Certificate is missing or invalid');
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
        
        // Support wildcards
        if (name.startsWith('*.')) {
            const baseDomain = name.slice(2);
            const hostParts = hostname.split('.');
            if (hostParts.length >= 2) {
                const hostBaseDomain = hostParts.slice(1).join('.');
                if (hostBaseDomain === baseDomain) {
                    return undefined; // Valid
                }
            }
        }
    }

    return new Error(`Hostname/IP does not match certificate's altnames`);
};

/**
 * Create TLS server (not supported)
 */
tls.createServer = function(options, secureConnectionListener) {
    const error = new Error('TLS server functionality not supported in serverless environment');
    error.code = 'ENOTSUP';
    throw error;
};

/**
 * Get CA certificates
 */
tls.getCACertificates = function(store) {
    return getCACertificates(store);
};

// Export classes and constants
tls.TLSSocket = TLSSocket;
tls.SecureContext = SecureContext;
tls.Server = Server;
tls.DEFAULT_ECDH_CURVE = 'prime256v1';
tls.DEFAULT_MAX_VERSION = 'TLSv1.3';
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';

// Constants
Object.defineProperty(tls, 'constants', {
    value: TLS_CONSTANTS,
    writable: false,
    configurable: false
});

// Lazy load root certificates
Object.defineProperty(tls, 'rootCertificates', {
    get: function() {
        const certs = getCACertificates('bundled');
        return certs;
    },
    configurable: true
});

// Legacy/compatibility functions that throw not supported
tls.createSecurePair = function() {
    const error = new Error('createSecurePair is deprecated and not supported');
    error.code = 'ENOTSUP';
    throw error;
};

(function() {
    // Register module 'https'
    const self = {};
    builtinModule['https'] = self;

    // Lazy require helpers to avoid bootstrap dependency issues
    const getHttp = () => require('http');
    const getTls = () => require('tls');

    // Error object conversion utility (same pattern as fs module)
    function convertErrorObject(value) {
        if (!value || typeof value.message !== 'string') {
            return value;
        }

        const error = new Error(value.message);

        try {
            const errorMessagePrefix = '__NET_ERROR__:';
            if (value.message?.startsWith(errorMessagePrefix)) {
                const errorInfo = JSON.parse(value.message.substring(errorMessagePrefix.length));
                Object.assign(error, errorInfo);
            }
        }
        catch {}

        return error;
    }

    // HTTPS Agent extending HTTP Agent with TLS support
    class Agent extends getHttp().Agent {
        constructor(options = {}) {
            super({
                ...options,
                defaultPort: options.defaultPort || 443,
                protocol: options.protocol || 'https:'
            });
            
            // TLS-specific options
            this.ca = options.ca;
            this.cert = options.cert;
            this.ciphers = options.ciphers;
            this.clientCertEngine = options.clientCertEngine;
            this.crl = options.crl;
            this.dhparam = options.dhparam;
            this.ecdhCurve = options.ecdhCurve;
            this.honorCipherOrder = options.honorCipherOrder;
            this.key = options.key;
            this.maxVersion = options.maxVersion;
            this.minVersion = options.minVersion;
            this.passphrase = options.passphrase;
            this.pfx = options.pfx;
            this.rejectUnauthorized = options.rejectUnauthorized !== false; // Default true
            this.secureOptions = options.secureOptions;
            this.secureProtocol = options.secureProtocol;
            this.servername = options.servername;
            this.sessionIdContext = options.sessionIdContext;
        }

        _createConnection(options) {
            const tlsOptions = {
                ...options,
                // Copy TLS-specific options from agent
                ca: this.ca,
                cert: this.cert,
                ciphers: this.ciphers,
                clientCertEngine: this.clientCertEngine,
                crl: this.crl,
                dhparam: this.dhparam,
                ecdhCurve: this.ecdhCurve,
                honorCipherOrder: this.honorCipherOrder,
                key: this.key,
                maxVersion: this.maxVersion,
                minVersion: this.minVersion,
                passphrase: this.passphrase,
                pfx: this.pfx,
                rejectUnauthorized: this.rejectUnauthorized,
                secureOptions: this.secureOptions,
                secureProtocol: this.secureProtocol,
                servername: this.servername || options.hostname || options.host,
                sessionIdContext: this.sessionIdContext
            };

            return getTls().connect(tlsOptions);
        }

        createConnection(options, callback) {
            return this._createConnection(options);
        }

        getName(options) {
            let name = super.getName(options);
            
            // Add TLS-specific properties to the name for connection pooling
            if (this.ca) name += ':ca:' + this.ca;
            if (this.cert) name += ':cert:' + this.cert;
            if (this.key) name += ':key:' + this.key;
            if (this.pfx) name += ':pfx:' + this.pfx;
            if (this.ciphers) name += ':ciphers:' + this.ciphers;
            if (this.rejectUnauthorized === false) name += ':rejectUnauthorized:false';
            if (this.servername) name += ':servername:' + this.servername;
            
            return name;
        }
    }

    // Global HTTPS agent
    self.globalAgent = new Agent();

    // HTTPS ClientRequest extending HTTP ClientRequest
    class ClientRequest extends getHttp().ClientRequest {
        constructor(options, callback) {
            // Store original options before they get modified (in local variable first)
            const originalOptions = { ...options };
            
            // Set protocol to https if not specified
            options = {
                protocol: 'https:',
                port: 443,
                agent: self.globalAgent,
                ...options
            };

            super(options, callback);
            
            // Now we can assign to this after super() call
            this._originalOptions = originalOptions;
        }

        _createConnection(options = {}) {
            // Create TLS connection with proper options
            const tlsOptions = {
                port: this.port,
                host: this.host,
                servername: this._originalOptions.servername || this.host,
                rejectUnauthorized: this._originalOptions.rejectUnauthorized === undefined ? true : this._originalOptions.rejectUnauthorized,
                // Copy TLS-specific options from original request
                ca: this._originalOptions.ca,
                cert: this._originalOptions.cert,
                key: this._originalOptions.key,
                pfx: this._originalOptions.pfx,
                passphrase: this._originalOptions.passphrase,
                ciphers: this._originalOptions.ciphers,
                secureProtocol: this._originalOptions.secureProtocol,
                secureOptions: this._originalOptions.secureOptions,
                sessionIdContext: this._originalOptions.sessionIdContext
            };

            const socket = getTls().connect(tlsOptions);
            
            // Use HTTP's socket assignment but override for TLS events
            this._assignSocket(socket);
            
            // Set up callback for response when connection is ready (reuse HTTP logic)
            if (this._callback && typeof this._callback === 'function') {
                this.on('response', this._callback);
            }
        }

        _assignSocket(socket) {
            // Reuse all HTTP socket assignment logic
            super._assignSocket(socket);
            
            // Override only the connection event for TLS
            // Remove HTTP's 'connect' listener and add TLS 'secureConnect'
            const httpConnectListeners = socket.listeners('connect');
            socket.removeAllListeners('connect');
            
            socket.on('secureConnect', () => {
                // Execute the same logic as HTTP connect, but for TLS
                httpConnectListeners.forEach(listener => {
                    try {
                        listener.call(socket);
                    } catch (error) {
                        console.warn('[HTTPS] Error in secureConnect listener:', error.message);
                    }
                });
            });
        }
    }

    // Main HTTPS request function - reuse HTTP logic but with HTTPS defaults
    self.request = function(url, options, callback) {
        // Parse URL if string, same as HTTP module
        if (typeof url === 'string') {
            const parsed = new URL(url);
            options = {
                protocol: 'https:',
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.pathname + parsed.search,
                ...options
            };
        } else {
            callback = options;
            options = url;
        }

        // Ensure HTTPS defaults
        options = {
            protocol: 'https:',
            port: 443,
            agent: self.globalAgent,
            ...options
        };

        return new ClientRequest(options, callback);
    };

    // GET convenience method - identical to HTTP but uses HTTPS request
    self.get = function(url, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        options = { ...options, method: 'GET' };
        const req = self.request(url, options, callback);
        req.end();
        return req;
    };

    // Server stubs - reuse HTTP Server class but throw HTTPS-specific errors
    class Server extends getHttp().Server {
        listen() {
            const error = new Error('HTTPS server functionality not supported in VM environment');
            error.code = 'ENOTSUP';
            error.errno = -95;
            error.syscall = 'listen';
            throw error;
        }
    }

    self.createServer = function(options, requestListener) {
        const error = new Error('HTTPS server functionality not supported in VM environment');
        error.code = 'ENOTSUP';
        error.errno = -95;
        error.syscall = 'createServer';
        throw error;
    };

    self.Server = Server;

    // Export classes
    self.Agent = Agent;
    self.ClientRequest = ClientRequest;

    // Re-export HTTP constants and classes that are the same
    self.METHODS = getHttp().METHODS;
    self.STATUS_CODES = getHttp().STATUS_CODES;
    self.IncomingMessage = getHttp().IncomingMessage;
    self.OutgoingMessage = getHttp().OutgoingMessage;
    self.maxHeaderSize = getHttp().maxHeaderSize;
})();
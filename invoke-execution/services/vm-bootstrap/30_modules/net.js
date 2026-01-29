(function() {
    // Register module 'net'
    const self = {};
    builtinModule['net'] = self;

    const EventEmitter = require('events');

    // Socket class to wrap handle-based operations
    class Socket extends EventEmitter {
        constructor(handle) {
            super();
            this._handle = handle;
        }

        write(data, encodingOrCallback, callback) {
            // Handle overloads: write(data), write(data, encoding), write(data, callback), write(data, encoding, callback)
            let actualData = data;
            let actualEncoding = undefined;
            let actualCallback = undefined;

            if (typeof encodingOrCallback === 'function') {
                actualCallback = encodingOrCallback;
            } else if (typeof encodingOrCallback === 'string') {
                actualEncoding = encodingOrCallback;
                if (typeof callback === 'function') {
                    actualCallback = callback;
                }
            }

            // Convert string to Buffer with encoding if needed
            if (typeof actualData === 'string' && actualEncoding) {
                actualData = Buffer.from(actualData, actualEncoding);
            } else if (typeof actualData === 'string') {
                actualData = Buffer.from(actualData, 'utf8');
            }

            // Wrap callback in ivm.Reference if provided
            const wrappedCallback = actualCallback ? new ivm.Reference(actualCallback) : null;

            try {
                return _net_socketWrite.applySync(undefined, [this._handle, actualData, wrappedCallback], { arguments: { copy: true } });
            } catch (err) {
                throw err;
            }
        }

        read(size) {
            const result = _net_socketRead.applySync(undefined, [this._handle, size], { arguments: { copy: true } });
            // Convert ArrayBuffer back to Buffer
            if (result instanceof ArrayBuffer) {
                return Buffer.from(result);
            }
            return result;
        }

        destroy(error) {
            _net_socketDestroy.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        connect(port, host, connectCallback) {
            // Handle overloads: connect(port), connect(port, host), connect(port, callback), connect(port, host, callback)
            let actualPort = port;
            let actualHost = 'localhost';
            let actualCallback = connectCallback;

            if (typeof host === 'function') {
                actualCallback = host;
                actualHost = 'localhost';
            } else if (typeof host === 'string') {
                actualHost = host;
            }

            // Establish connection on existing socket handle
            const wrappedCallback = actualCallback ? new ivm.Reference((err, handleId) => {
                if (err) {
                    actualCallback(err);
                } else {
                    actualCallback(null);
                }
            }) : null;

            _net_socketConnect.applySync(undefined, [this._handle, actualPort, actualHost, wrappedCallback], { arguments: { copy: true } });
            return this;
        }

        end(dataOrEncoding, encodingOrCallback, callback) {
            let actualData = dataOrEncoding;
            let actualEncoding = undefined;
            let actualCallback = callback;

            // Handle overloads: end(), end(data), end(data, encoding), end(callback), end(data, callback), end(data, encoding, callback)
            if (typeof dataOrEncoding === 'function') {
                actualCallback = dataOrEncoding;
                actualData = undefined;
            } else if (typeof dataOrEncoding === 'string') {
                actualData = dataOrEncoding;
                if (typeof encodingOrCallback === 'string') {
                    actualEncoding = encodingOrCallback;
                } else if (typeof encodingOrCallback === 'function') {
                    actualCallback = encodingOrCallback;
                }
            } else if (dataOrEncoding === undefined) {
                if (typeof encodingOrCallback === 'function') {
                    actualCallback = encodingOrCallback;
                }
            }

            // Wrap callback in ivm.Reference if provided
            const wrappedCallback = actualCallback ? new ivm.Reference(actualCallback) : null;

            _net_socketEnd.applySync(undefined, [this._handle, wrappedCallback], { arguments: { copy: true } });
        }

        pause() {
            _net_socketPause.applySync(undefined, [this._handle], { arguments: { copy: true } });
            return this;
        }

        resume() {
            _net_socketResume.applySync(undefined, [this._handle], { arguments: { copy: true } });
            return this;
        }

        setTimeout(timeout, callback) {
            const wrappedCallback = callback ? new ivm.Reference(callback) : null;
            _net_socketSetTimeout.applySync(undefined, [this._handle, timeout, wrappedCallback], { arguments: { copy: true } });
            return this;
        }

        setNoDelay(noDelay) {
            _net_socketSetNoDelay.applySync(undefined, [this._handle, noDelay === undefined ? true : noDelay], { arguments: { copy: true } });
            return this;
        }

        setKeepAlive(enable, initialDelay) {
            _net_socketSetKeepAlive.applySync(undefined, [this._handle, enable === undefined ? false : enable, initialDelay || 0], { arguments: { copy: true } });
            return this;
        }

        get localAddress() {
            return _net_socketGetLocalAddress.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get localPort() {
            return _net_socketGetLocalPort.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get remoteAddress() {
            return _net_socketGetRemoteAddress.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get remotePort() {
            return _net_socketGetRemotePort.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get remoteFamily() {
            return _net_socketGetRemoteFamily.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get bytesRead() {
            return _net_socketGetBytesRead.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get bytesWritten() {
            return _net_socketGetBytesWritten.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        get readyState() {
            return _net_socketGetReadyState.applySync(undefined, [this._handle], { arguments: { copy: true } });
        }

        on(event, listener) {
            // Wrap the listener to convert ArrayBuffers (from data events) back to Buffers
            const wrappedListener = new ivm.Reference((...args) => {
                const convertedArgs = args.map(arg => {
                    // For data events, the arg is an ArrayBuffer
                    if (event === 'data' && arg instanceof ArrayBuffer) {
                        return Buffer.from(arg);
                    }
                    return arg;
                });
                listener(...convertedArgs);
            });
            _net_socketOn.applySync(undefined, [this._handle, event, wrappedListener], { arguments: { copy: true } });
            return this;
        }

        once(event, listener) {
            // Wrap the listener to convert ArrayBuffers (from data events) back to Buffers
            const wrappedListener = new ivm.Reference((...args) => {
                const convertedArgs = args.map(arg => {
                    // For data events, the arg is an ArrayBuffer
                    if (event === 'data' && arg instanceof ArrayBuffer) {
                        return Buffer.from(arg);
                    }
                    return arg;
                });
                listener(...convertedArgs);
            });
            _net_socketOnce.applySync(undefined, [this._handle, event, wrappedListener], { arguments: { copy: true } });
            return this;
        }

        removeListener(event, listener) {
            // Note: Host-side doesn't need to remove, just remove from VM side
            return super.removeListener(event, listener);
        }
    }

    /**
     * Create a client socket connection
     * @param {number} port - The port to connect to (optional)
     * @param {string} host - The host to connect to (optional)
     * @param {function} connectCallback - Called when connection is established or on error (optional)
     * @returns {Socket} The socket object
     */
    self.createConnection = function(port, host, connectCallback) {
        // Handle no arguments case - creates unconnected socket
        if (port === undefined && host === undefined && connectCallback === undefined) {
            const handleId = _net_createSocket.applySync(undefined, [], { arguments: { copy: true } });
            return new Socket(handleId);
        }
        
        // Handle overloads: createConnection(port), createConnection(port, host), createConnection(port, callback), createConnection(port, host, callback)
        let actualPort = port;
        let actualHost = 'localhost';
        let actualCallback = connectCallback;

        if (typeof host === 'function') {
            actualCallback = host;
            actualHost = 'localhost';
        } else if (typeof host === 'string') {
            actualHost = host;
        }

        // Create wrapper for the connection callback
        // Host returns [null, handleId] on success or [err] on failure
        const wrappedCallback = actualCallback ? new ivm.Reference((err, handleId) => {
            if (err) {
                actualCallback(err);
            } else {
                // Host already created the handle, just create Socket wrapper
                actualCallback(null);
            }
        }) : null;

        const handleId = _net_createConnection.applySync(undefined, [actualPort, actualHost, wrappedCallback], { arguments: { copy: true } });
        const socket = new Socket(handleId);

        return socket;
    };

    /**
     * Alias for createConnection
     */
    self.connect = self.createConnection;

    // Export Socket class for advanced usage
    self.Socket = Socket;

    // Constants
    self.constants = {
        // Socket states
        TCP_NODELAY: 'TCP_NODELAY',
        TCP_KEEPALIVE: 'TCP_KEEPALIVE'
    };
})();

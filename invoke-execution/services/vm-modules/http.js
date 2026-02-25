const http = {};
module.exports = http;

// Lazy require helpers to avoid bootstrap dependency issues
const { EventEmitter } = require('events');
const stream = require('stream');
const net = require('net');
const URL = require('url').URL;

// HTTP constants
http.METHODS = [
    'ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD',
    'LINK', 'LOCK', 'M-SEARCH', 'MERGE', 'MKACTIVITY', 'MKCALENDAR', 'MKCOL',
    'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH',
    'PURGE', 'PUT', 'REBIND', 'REPORT', 'SEARCH', 'SOURCE', 'SUBSCRIBE',
    'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE'
];

http.STATUS_CODES = {
    100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints',
    200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information',
    204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status',
    208: 'Already Reported', 226: 'IM Used',
    300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
    304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
    407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict',
    410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed',
    413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable', 417: 'Expectation Failed', 418: "I'm a Teapot",
    421: 'Misdirected Request', 422: 'Unprocessable Entity', 423: 'Locked',
    424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required',
    428: 'Precondition Required', 429: 'Too Many Requests',
    431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
    503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected',
    510: 'Not Extended', 511: 'Network Authentication Required'
};

// Header processing utilities
const ARRAY_HEADERS = ['set-cookie', 'vary', 'via', 'warning'];
const SEMICOLON_HEADERS = ['cookie'];

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

function processHeaders(rawHeaders) {
    const headers = {};
    const headersDistinct = {};
    
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i].toLowerCase();
        const value = rawHeaders[i + 1];
        
        // Process headers object (comma-separated or special handling)
        if (ARRAY_HEADERS.includes(name)) {
            // set-cookie and similar headers - comma separate in headers
            headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
        } else if (SEMICOLON_HEADERS.includes(name)) {
            // cookie header - semicolon separate
            headers[name] = headers[name] ? `${headers[name]}; ${value}` : value;
        } else if (name === 'authorization') {
            // authorization - first wins
            headers[name] = headers[name] || value;
        } else {
            // standard headers - comma separate
            headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
        }
        
        // Process headersDistinct object (arrays for duplicates)
        if (headersDistinct[name]) {
            if (Array.isArray(headersDistinct[name])) {
                headersDistinct[name].push(value);
            } else {
                headersDistinct[name] = [headersDistinct[name], value];
            }
        } else {
            headersDistinct[name] = value;
        }
    }
    
    return { headers, headersDistinct };
}

// HTTP Parser - streaming implementation
class HTTPParser extends EventEmitter {
    constructor(type) {
        super();
        this.type = type; // 'request' or 'response'
        this.state = 'HEADER';
        this.buffer = Buffer.alloc(0);
        this.headers = [];
        this.method = null;
        this.url = null;
        this.statusCode = null;
        this.statusMessage = null;
        this.httpVersion = '1.1';
        this.contentLength = null;
        this.chunked = false;
        this.complete = false;
    }

    execute(data) {
        this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
        
        while (this.buffer.length > 0) {
            if (this.state === 'HEADER') {
                const headerEnd = this.buffer.indexOf('\r\n\r\n');
                if (headerEnd === -1) return; // Need more data
                
                const headerData = this.buffer.slice(0, headerEnd).toString('latin1');
                this.buffer = this.buffer.slice(headerEnd + 4);
                
                this._parseHeaders(headerData);
                
                if (this.method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304) {
                    this.state = 'COMPLETE';
                    this.complete = true;
                    this.emit('messageComplete');
                    return;
                }
                
                if (this.chunked) {
                    this.state = 'CHUNK_SIZE';
                } else if (this.contentLength === 0) {
                    this.state = 'COMPLETE';
                    this.complete = true;
                    this.emit('messageComplete');
                    return;
                } else if (this.contentLength > 0) {
                    this.state = 'BODY';
                } else {
                    // Connection close or unknown length
                    this.state = 'BODY_UNTIL_CLOSE';
                }
                
            } else if (this.state === 'BODY') {
                if (this.buffer.length >= this.contentLength) {
                    const body = this.buffer.slice(0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.emit('body', body);
                    this.state = 'COMPLETE';
                    this.complete = true;
                    this.emit('messageComplete');
                    return;
                } else {
                    // Need more data
                    return;
                }
                
            } else if (this.state === 'BODY_UNTIL_CLOSE') {
                if (this.buffer.length > 0) {
                    this.emit('body', this.buffer);
                    this.buffer = Buffer.alloc(0);
                }
                return;
                
            } else if (this.state === 'CHUNK_SIZE') {
                const chunkEnd = this.buffer.indexOf('\r\n');
                if (chunkEnd === -1) return; // Need more data
                
                const chunkSizeHex = this.buffer.slice(0, chunkEnd).toString('ascii').split(';')[0];
                const chunkSize = parseInt(chunkSizeHex, 16);
                this.buffer = this.buffer.slice(chunkEnd + 2);
                
                if (chunkSize === 0) {
                    this.state = 'CHUNK_TRAILERS';
                } else {
                    this.chunkSize = chunkSize;
                    this.state = 'CHUNK_DATA';
                }
                
            } else if (this.state === 'CHUNK_DATA') {
                if (this.buffer.length >= this.chunkSize + 2) {
                    const chunk = this.buffer.slice(0, this.chunkSize);
                    this.buffer = this.buffer.slice(this.chunkSize + 2); // +2 for trailing \r\n
                    this.emit('body', chunk);
                    this.state = 'CHUNK_SIZE';
                } else {
                    return; // Need more data
                }
                
            } else if (this.state === 'CHUNK_TRAILERS') {
                const trailerEnd = this.buffer.indexOf('\r\n');
                if (trailerEnd === -1) return; // Need more data
                
                this.buffer = this.buffer.slice(trailerEnd + 2);
                this.state = 'COMPLETE';
                this.complete = true;
                this.emit('messageComplete');
                return;
            }
        }
    }

    _parseHeaders(headerData) {
        const lines = headerData.split('\r\n');
        const statusLine = lines[0];
        
        if (this.type === 'response') {
            const statusMatch = statusLine.match(/^HTTP\/(\d\.\d) (\d{3})(?: (.+))?$/);
            if (statusMatch) {
                this.httpVersion = statusMatch[1];
                this.statusCode = parseInt(statusMatch[2]);
                this.statusMessage = statusMatch[3] || http.STATUS_CODES[this.statusCode] || '';
            }
        } else {
            const requestMatch = statusLine.match(/^(\w+) (.+) HTTP\/(\d\.\d)$/);
            if (requestMatch) {
                this.method = requestMatch[1];
                this.url = requestMatch[2];
                this.httpVersion = requestMatch[3];
            }
        }
        
        // Parse headers
        const rawHeaders = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;
            
            const name = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            rawHeaders.push(name, value);
            
            // Check for content-length and transfer-encoding
            if (name.toLowerCase() === 'content-length') {
                this.contentLength = parseInt(value);
            } else if (name.toLowerCase() === 'transfer-encoding' && value.toLowerCase().includes('chunked')) {
                this.chunked = true;
            }
        }
        
        this.rawHeaders = rawHeaders;
        const processed = processHeaders(rawHeaders);
        this.headers = processed.headers;
        this.headersDistinct = processed.headersDistinct;
        
        this.emit('headersComplete', {
            httpVersion: this.httpVersion,
            method: this.method,
            url: this.url,
            statusCode: this.statusCode,
            statusMessage: this.statusMessage,
            headers: this.headers,
            headersDistinct: this.headersDistinct,
            rawHeaders: this.rawHeaders
        });
    }
}

// IncomingMessage class
class IncomingMessage extends stream.Readable {
    constructor(socket) {
        super();
        this.socket = socket;
        this.complete = false;
        this.headers = {};
        this.headersDistinct = {};
        this.rawHeaders = [];
        this.httpVersion = '1.1';
        this.method = null;
        this.url = null;
        this.statusCode = null;
        this.statusMessage = null;
        this._chunks = [];
        this._body = null;
        this._encoding = null;
    }

    _read(size) {
        // Implemented by parser
    }

    setEncoding(encoding) {
        this._encoding = encoding;
        return this;
    }

    setTimeout(msecs, callback) {
        if (this.socket) {
            this.socket.setTimeout(msecs, callback);
        }
        return this;
    }
}

// OutgoingMessage base class
class OutgoingMessage extends stream.Writable {
    constructor() {
        super();
        this.socket = null;
        this.headersSent = false;
        this.headers = {};
        this._header = null;
        this.finished = false;
        this.chunkedEncoding = false;
        this.shouldKeepAlive = true;
        this.maxRequestsOnConnectionReached = false;
        this.sendDate = true;
    }

    setHeader(name, value) {
        if (this.headersSent) {
            throw new Error('Cannot set headers after they are sent to the client');
        }
        this.headers[name.toLowerCase()] = value;
    }

    getHeader(name) {
        return this.headers[name.toLowerCase()];
    }

    getHeaders() {
        return { ...this.headers };
    }

    getHeaderNames() {
        return Object.keys(this.headers);
    }

    hasHeader(name) {
        return name.toLowerCase() in this.headers;
    }

    removeHeader(name) {
        delete this.headers[name.toLowerCase()];
    }

    flushHeaders() {
        if (!this.headersSent) {
            this._writeHead();
        }
    }

    _writeHead() {
        // Default implementation - can be overridden by subclasses
        // ClientRequest will override this with HTTP-specific logic
    }

    _write(chunk, encoding, callback) {
        if (!this.headersSent) {
            this._writeHead();
        }

        // Create connection if it doesn't exist (for when write() is called before end())
        if (!this.socket) {
            this._createConnection();
        }

        // If socket is connected, write directly; otherwise queue the write
        if (this.socket && this._socketConnected) {
            try {
                return this.socket.write(chunk, encoding, callback);
            } catch (error) {
                callback(error);
            }
        } else {
            // Queue the write until socket is connected
            this._writeQueue.push({ chunk, encoding, callback });
        }
    }

    _final(callback) {
        if (this.chunkedEncoding && this.socket) {
            this.socket.write('0\r\n\r\n', 'ascii', callback);
        } else {
            callback();
        }
    }

    end(chunk, encoding, callback) {
        if (typeof chunk === 'function') {
            callback = chunk;
            chunk = null;
            encoding = null;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        // Create connection when request is sent
        if (!this.socket) {
            this._createConnection();
        }

        super.end(chunk, encoding, callback);
    }
}

// ClientRequest class
class ClientRequest extends OutgoingMessage {
    constructor(options, callback) {
        super();
        
        this.method = (options.method || 'GET').toUpperCase();
        this.path = options.path || '/';
        this.host = options.hostname || options.host || 'localhost';
        this.port = options.port || (options.protocol === 'https:' ? 443 : 80);
        this.protocol = options.protocol || 'http:';
        this.agent = options.agent !== undefined ? options.agent : http.globalAgent;
        this.timeout = options.timeout;
        this.auth = options.auth;
        
        this.reusedSocket = false;
        this.maxHeadersCount = null;
        this.aborted = false;
        this._callback = callback;
        this._writeQueue = []; // Queue for writes before socket connection
        this._socketConnected = false;
        
        // Process headers from options
        if (options.headers) {
            for (const [name, value] of Object.entries(options.headers)) {
                this.setHeader(name, value);
            }
        }
        
        // Don't create connection in constructor - wait for end() call
    }

    _flushWriteQueue() {
        // Process all queued writes
        while (this._writeQueue.length > 0) {
            const { chunk, encoding, callback } = this._writeQueue.shift();
            try {
                this.socket.write(chunk, encoding, callback);
            } catch (error) {
                callback(error);
            }
        }
    }

    _createConnection(options) {
        // Use agent if available
        if (this.agent && typeof this.agent.addRequest === 'function') {
            const requestOptions = {
                hostname: this.host,
                host: this.host,
                port: this.port,
                method: this.method,
                path: this.path,
                headers: this.headers,
                timeout: this.timeout,
                ...options
            };
            
            this.agent.addRequest(this, requestOptions);
            return;
        }

        // Fallback to direct connection if no agent
        const socket = net.createConnection({
            port: this.port,
            host: this.host,
            timeout: this.timeout
        });

        this._assignSocket(socket);
    }

    _assignSocket(socket) {
        this.socket = socket;
        this.reusedSocket = socket._httpReused || false;
        
        socket._httpReused = true;
        
        // Set up callback for response when socket is assigned
        if (this._callback && typeof this._callback === 'function') {
            this.on('response', this._callback);
        }
        
        const onConnect = () => {
            this.emit('socket', socket);
            // Send HTTP request when socket connects
            if (!this.headersSent && this._header) {
                try {
                    this.socket.write(this._header, 'ascii');
                    this.headersSent = true;
                } catch (error) {
                    // Ignore header write errors
                }
            } else if (!this.headersSent) {
                try {
                    if (this.socket) {
                        this._writeHead();
                    }
                } catch (error) {
                    // Ignore header write errors
                }
            }
            
            // Mark socket as connected and flush queued writes
            this._socketConnected = true;
            this._flushWriteQueue();
        };
        
        const onError = (err) => {
            // Convert error object using the same pattern as fs module
            const convertedError = convertErrorObject(err);
            this.emit('error', convertedError);
        };
        
        const onClose = () => {
            this.emit('close');
        };
        
        socket.on('error', onError);
        socket.on('close', onClose);

        // Set up response parser
        const parser = new HTTPParser('response');
        
        // Store the data handler so we can remove it later
        const onData = (data) => {
            parser.execute(data);
        };
        
        parser.on('headersComplete', (info) => {
            const response = new IncomingMessage(socket);
            Object.assign(response, info);
            
            // Check for upgrade
            if (info.statusCode === 101 && info.headers.upgrade) {
                const head = parser.buffer;
                parser.removeAllListeners();
                socket.removeListener('data', onData);
                this.emit('upgrade', response, socket, head);
                return;
            }
            
            this.emit('response', response);
            
            parser.on('body', (chunk) => {
                response.push(chunk);
            });
            
            parser.on('messageComplete', () => {
                response.push(null);
                response.complete = true;
                
                // Clean up the data listener immediately when message is complete
                socket.removeListener('data', onData);
                parser.removeAllListeners();
                
                // Emit free immediately to return socket to agent pool
                setImmediate(() => {
                    socket.emit('free');
                });
            });
        });

        socket.on('data', onData);

        // Handle connection - socket might already be connected
        if (socket.readyState === 'open' || socket.connecting === false) {
            // Socket is already connected
            process.nextTick(onConnect);
        } else {
            // Socket is still connecting
            socket.once('connect', onConnect);
        }
    }

    _writeHead() {
        if (this.headersSent) return;
        
        // Add required headers if not already set
        if (!this.headers['host']) {
            this.headers['host'] = this.host + (this.port !== 80 && this.port !== 443 ? `:${this.port}` : '');
        }
        
        if (!this.headers['user-agent']) {
            this.headers['user-agent'] = 'Node.js HTTP Client';
        }
        
        if (!this.headers['connection']) {
            this.headers['connection'] = this.agent && this.agent.keepAlive ? 'keep-alive' : 'close';
        }
        
        let head = `${this.method} ${this.path} HTTP/1.1\r\n`;
        
        for (const [name, value] of Object.entries(this.headers)) {
            head += `${name}: ${value}\r\n`;
        }
        
        head += '\r\n';
        this._header = head;
        
        if (this.socket) {
            try {
                this.socket.write(head, 'ascii');
                this.headersSent = true; // Only set after successful write
            } catch (error) {
                // Ignore header write errors
            }
        } else {
            // Headers will be sent when socket connects
        }
    }

    setTimeout(timeout, callback) {
        if (this.socket) {
            this.socket.setTimeout(timeout, callback);
        }
        return this;
    }

    setNoDelay(noDelay) {
        if (this.socket) {
            this.socket.setNoDelay(noDelay);
        }
        return this;
    }

    setSocketKeepAlive(enable, initialDelay) {
        if (this.socket) {
            this.socket.setKeepAlive(enable, initialDelay);
        }
        return this;
    }

    abort() {
        if (this.aborted) return;
        this.aborted = true;
        
        if (this.socket) {
            this.socket.destroy();
        }
        
        this.emit('abort');
    }

    onSocket(socket) {
        this._assignSocket(socket);
    }
}

// Agent class with connection pooling
class Agent extends EventEmitter {
    constructor(options = {}) {
        super();
        this.defaultPort = options.defaultPort || 80;
        this.protocol = options.protocol || 'http:';
        this.maxSockets = options.maxSockets || 5;
        this.maxFreeSockets = options.maxFreeSockets || 2;
        this.maxTotalSockets = options.maxTotalSockets || Infinity;
        this.keepAlive = options.keepAlive || false;
        this.keepAliveMsecs = options.keepAliveMsecs || 1000;
        this.timeout = options.timeout;
        this.scheduling = options.scheduling || 'lifo';
        
        // Socket pools
        this.sockets = new Map(); // activeKey -> socket[]
        this.freeSockets = new Map(); // activeKey -> socket[]
        this.requests = new Map(); // activeKey -> request[]
        
        // Timeouts for cleanup
        this.freeSocketTimeouts = new Map(); // socket -> timeout
    }

    addRequest(req, options) {
        const key = this._getSocketKey(options);
        
        // Try to reuse a free socket
        const freeSockets = this.freeSockets.get(key) || [];
        if (freeSockets.length > 0) {
            const socket = this.scheduling === 'fifo' ? 
                freeSockets.shift() : freeSockets.pop();
            
            this._clearSocketTimeout(socket);
            this.freeSockets.set(key, freeSockets);
            
            req.reusedSocket = true;
            req.onSocket(socket);
            return;
        }
        
        // Check socket limits
        const activeSockets = this.sockets.get(key) || [];
        if (activeSockets.length >= this.maxSockets) {
            // Queue the request
            const requests = this.requests.get(key) || [];
            requests.push(req);
            this.requests.set(key, requests);
            return;
        }
        
        // Create new connection
        this._createConnection(req, options);
    }

    _createConnection(req, options) {
        const key = this._getSocketKey(options);
        const socket = net.createConnection({
            port: options.port || this.defaultPort,
            host: options.hostname || options.host || 'localhost',
            timeout: this.timeout
        });
        
        // Track active socket
        const activeSockets = this.sockets.get(key) || [];
        activeSockets.push(socket);
        this.sockets.set(key, activeSockets);
        
        // Set up socket lifecycle
        socket.on('free', () => {
            this._handleSocketFree(socket, key);
        });
        
        socket.on('close', () => {
            this._handleSocketClose(socket, key);
        });
        
        socket.on('error', (err) => {
            this._handleSocketError(socket, key, err);
        });
        
        if (this.keepAlive) {
            socket.setKeepAlive(true, this.keepAliveMsecs);
        }
        
        if (this.timeout) {
            socket.setTimeout(this.timeout, () => {
                socket.destroy();
            });
        }
        
        req.onSocket(socket);
    }

    _handleSocketFree(socket, key) {
        // Check for queued requests first
        const requests = this.requests.get(key) || [];
        if (requests.length > 0) {
            const req = requests.shift();
            this.requests.set(key, requests);
            req.reusedSocket = true;
            req.onSocket(socket);
            return;
        }
        
        // Add to free pool if keeping alive and under limit
        if (this.keepAlive) {
            const freeSockets = this.freeSockets.get(key) || [];
            if (freeSockets.length < this.maxFreeSockets) {
                freeSockets.push(socket);
                this.freeSockets.set(key, freeSockets);
                
                // Set timeout for cleanup
                const timeout = setTimeout(() => {
                    this._removeSocket(socket, key, 'timeout');
                    socket.destroy();
                }, this.keepAliveMsecs);
                
                this.freeSocketTimeouts.set(socket, timeout);
                return;
            }
        }
        
        // Destroy if not keeping alive or over limit
        socket.destroy();
    }

    _handleSocketClose(socket, key) {
        this._removeSocket(socket, key, 'close');
    }

    _handleSocketError(socket, key, err) {
        this._removeSocket(socket, key, 'error');
    }

    _removeSocket(socket, key, reason) {
        // Remove from active sockets
        const activeSockets = this.sockets.get(key) || [];
        const activeIndex = activeSockets.indexOf(socket);
        if (activeIndex !== -1) {
            activeSockets.splice(activeIndex, 1);
            this.sockets.set(key, activeSockets);
        }
        
        // Remove from free sockets
        const freeSockets = this.freeSockets.get(key) || [];
        const freeIndex = freeSockets.indexOf(socket);
        if (freeIndex !== -1) {
            freeSockets.splice(freeIndex, 1);
            this.freeSockets.set(key, freeSockets);
        }
        
        // Clear timeout
        this._clearSocketTimeout(socket);
    }

    _clearSocketTimeout(socket) {
        const timeout = this.freeSocketTimeouts.get(socket);
        if (timeout) {
            clearTimeout(timeout);
            this.freeSocketTimeouts.delete(socket);
        }
    }

    _getSocketKey(options) {
        const host = options.hostname || options.host || 'localhost';
        const port = options.port || this.defaultPort;
        return `${host}:${port}`;
    }

    createConnection(options, callback) {
        return net.createConnection(options, callback);
    }

    getName(options) {
        return this._getSocketKey(options);
    }

    destroy() {
        // Close all sockets
        for (const sockets of this.sockets.values()) {
            for (const socket of sockets) {
                socket.destroy();
            }
        }
        
        for (const sockets of this.freeSockets.values()) {
            for (const socket of sockets) {
                socket.destroy();
            }
        }
        
        // Clear all timeouts
        for (const timeout of this.freeSocketTimeouts.values()) {
            clearTimeout(timeout);
        }
        
        this.sockets.clear();
        this.freeSockets.clear();
        this.requests.clear();
        this.freeSocketTimeouts.clear();
    }
}

// Global agent
http.globalAgent = new Agent();

// Main request function
http.request = function(url, options, callback) {
    if (typeof url === 'string') {
        const parsed = new URL(url);
        options = {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            ...options
        };
    } else {
        callback = options;
        options = url;
        // Normalize URL object spreads: pathname+search -> path (node-fetch passes URL spreads)
        if (!options.path && options.pathname) {
            options = { ...options, path: (options.pathname || '/') + (options.search || '') };
        }
    }
    
    return new ClientRequest(options, callback);
};

// GET convenience method
http.get = function(url, options, callback) {
    if (typeof url === 'string') {
        // Case: http.get('http://example.com', options, callback) 
        // or http.get('http://example.com', callback)
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = { ...options, method: 'GET' };
        const req = http.request(url, options, callback);
        req.end();
        return req;
    } else {
        // Case: http.get({hostname: 'example.com', ...}, callback)
        if (typeof options === 'function') {
            callback = options;
        }
        const requestOptions = { ...url, method: 'GET' };
        const req = http.request(requestOptions, callback);
        req.end();
        return req;
    }
};

// Server stubs that throw ENOTSUP
class Server extends EventEmitter {
    constructor() {
        super();
    }

    listen() {
        const error = new Error('HTTP server functionality not supported in serverless environment');
        error.code = 'ENOTSUP';
        error.errno = -95;
        error.syscall = 'listen';
        throw error;
    }

    close() {
        const error = new Error('HTTP server functionality not supported in serverless environment');
        error.code = 'ENOTSUP';
        throw error;
    }
}

http.createServer = function(options, requestListener) {
    const error = new Error('HTTP server functionality not supported in serverless environment');
    error.code = 'ENOTSUP';
    error.errno = -95;
    error.syscall = 'createServer';
    throw error;
};

http.Server = Server;

// Export classes
http.Agent = Agent;
http.ClientRequest = ClientRequest;
http.IncomingMessage = IncomingMessage;
http.OutgoingMessage = OutgoingMessage;

// Maximum header size
http.maxHeaderSize = 16384;

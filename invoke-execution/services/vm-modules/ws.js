const ws = {};
module.exports = ws;

// Lazy require helpers to avoid bootstrap dependency issues
const getEventEmitter = () => require('events');
const getStream = () => require('stream');
const getHttp = () => require('http');
const getHttps = () => require('https');
const getCrypto = () => require('crypto');

// WebSocket constants
const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODES = {
    CONTINUATION: 0x0,
    TEXT: 0x1,
    BINARY: 0x2,
    CLOSE: 0x8,
    PING: 0x9,
    PONG: 0xa
};

const CLOSE_CODES = {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    PROTOCOL_ERROR: 1002,
    UNSUPPORTED_DATA: 1003,
    NO_STATUS_RECEIVED: 1005,
    ABNORMAL_CLOSURE: 1006,
    INVALID_FRAME_PAYLOAD_DATA: 1007,
    POLICY_VIOLATION: 1008,
    MESSAGE_TOO_BIG: 1009,
    MANDATORY_EXTENSION: 1010,
    INTERNAL_ERROR: 1011,
    SERVICE_RESTART: 1012,
    TRY_AGAIN_LATER: 1013,
    TLS_HANDSHAKE: 1015
};

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

// WebSocket frame utilities
function createFrame(opcode, payload, masked = true) {
    const payloadLength = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);
    let headerLength = 2;
    
    // Determine extended payload length
    let extendedPayloadLength = null;
    if (payloadLength > 125) {
        if (payloadLength < 65536) {
            headerLength += 2;
            extendedPayloadLength = Buffer.allocUnsafe(2);
            extendedPayloadLength.writeUInt16BE(payloadLength);
        } else {
            headerLength += 8;
            extendedPayloadLength = Buffer.allocUnsafe(8);
            extendedPayloadLength.writeUInt32BE(0, 0); // High 32 bits
            extendedPayloadLength.writeUInt32BE(payloadLength, 4); // Low 32 bits
        }
    }
    
    // Add mask length if needed
    const maskLength = masked ? 4 : 0;
    headerLength += maskLength;
    
    // Create frame buffer
    const frame = Buffer.allocUnsafe(headerLength + payloadLength);
    let offset = 0;
    
    // First byte: FIN (1) + RSV (000) + Opcode (4)
    frame[offset++] = 0x80 | opcode; // FIN = 1
    
    // Second byte: MASK (1) + Payload Length (7)
    if (payloadLength <= 125) {
        frame[offset++] = (masked ? 0x80 : 0x00) | payloadLength;
    } else if (payloadLength < 65536) {
        frame[offset++] = (masked ? 0x80 : 0x00) | 126;
        extendedPayloadLength.copy(frame, offset);
        offset += 2;
    } else {
        frame[offset++] = (masked ? 0x80 : 0x00) | 127;
        extendedPayloadLength.copy(frame, offset);
        offset += 8;
    }
    
    // Masking key
    let maskKey = null;
    if (masked) {
        maskKey = getCrypto().randomBytes(4);
        maskKey.copy(frame, offset);
        offset += 4;
    }
    
    // Payload
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    if (masked && maskKey) {
        for (let i = 0; i < payloadBuffer.length; i++) {
            frame[offset + i] = payloadBuffer[i] ^ maskKey[i % 4];
        }
    } else {
        payloadBuffer.copy(frame, offset);
    }
    
    return frame;
}

function parseFrame(buffer) {
    if (buffer.length < 2) return null;
    
    let offset = 0;
    const firstByte = buffer[offset++];
    const secondByte = buffer[offset++];
    
    const fin = !!(firstByte & 0x80);
    const rsv1 = !!(firstByte & 0x40);
    const rsv2 = !!(firstByte & 0x20);
    const rsv3 = !!(firstByte & 0x10);
    const opcode = firstByte & 0x0f;
    
    const masked = !!(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    
    // Extended payload length
    if (payloadLength === 126) {
        if (buffer.length < offset + 2) return null;
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) return null;
        const high = buffer.readUInt32BE(offset);
        const low = buffer.readUInt32BE(offset + 4);
        payloadLength = high * 0x100000000 + low;
        offset += 8;
    }
    
    // Mask key
    let maskKey = null;
    if (masked) {
        if (buffer.length < offset + 4) return null;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
    }
    
    // Check if we have the complete payload
    const totalLength = offset + payloadLength;
    if (buffer.length < totalLength) return null;
    
    // Extract payload
    let payload = buffer.slice(offset, totalLength);
    
    // Unmask payload if needed
    if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskKey[i % 4];
        }
    }
    
    return {
        fin,
        rsv1,
        rsv2, 
        rsv3,
        opcode,
        masked,
        payload,
        totalLength
    };
}

// WebSocket class
class WebSocket extends getStream().Duplex {
    constructor(address, protocols, options) {
        if (typeof protocols === 'object' && protocols !== null && !Array.isArray(protocols)) {
            options = protocols;
            protocols = undefined;
        }
        
        options = options || {};
        
        super({
            allowHalfOpen: false,
            emitClose: true
        });
        
        this.url = address;
        this.protocol = '';
        this.extensions = {};
        this.readyState = WebSocket.CONNECTING;
        this.bufferedAmount = 0;
        
        this.protocols = Array.isArray(protocols) ? protocols : (protocols ? [protocols] : []);
        this.binaryType = 'nodebuffer';
        
        // Frame assembly state
        this._fragments = [];
        this._fragmentOpcode = null;
        this._frameBuffer = Buffer.alloc(0);
        
        // Connection state
        this._socket = null;
        this._isClient = true;
        
        if (address) {
            this._connect(address, protocols, options);
        }
    }

    _connect(address, protocols, options) {
        const parsedUrl = new URL(address);
        const isSecure = parsedUrl.protocol === 'wss:';
        const port = parsedUrl.port || (isSecure ? 443 : 80);
        const key = getCrypto().randomBytes(16).toString('base64');
        
        const headers = {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': key,
            ...(options.headers || {})
        };
        
        if (this.protocols.length > 0) {
            headers['Sec-WebSocket-Protocol'] = this.protocols.join(', ');
        }
        
        const requestOptions = {
            port: port,
            host: parsedUrl.hostname,
            headers: headers,
            protocol: parsedUrl.protocol,
            path: parsedUrl.pathname + parsedUrl.search,
            agent: options.agent
        };
        
        // Use HTTPS for wss:// and HTTP for ws://
        const httpModule = isSecure ? getHttps() : getHttp();
        const req = httpModule.request(requestOptions);
        
        req.on('error', (err) => {
            // Convert error object using the same pattern as fs module
            const error = convertErrorObject(err);
            this.readyState = WebSocket.CLOSED;
            this.emit('error', error);
        });
        
        req.on('response', (res) => {
            const error = new Error(`Unexpected server response: ${res.statusCode}`);
            error.statusCode = res.statusCode;
            this.readyState = WebSocket.CLOSED;
            this.emit('error', error);
        });
        
        req.on('upgrade', (res, socket, head) => {
            // Validate upgrade response
            const upgrade = res.headers.upgrade;
            if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
                const error = new Error('Invalid Upgrade header');
                this.readyState = WebSocket.CLOSED;
                this.emit('error', error);
                return;
            }
            
            const connection = res.headers.connection;
            if (!connection || !connection.toLowerCase().split(/\s*,\s*/).includes('upgrade')) {
                const error = new Error('Invalid Connection header');
                this.readyState = WebSocket.CLOSED;
                this.emit('error', error);
                return;
            }
            
            const acceptKey = res.headers['sec-websocket-accept'];
            const expectedKey = getCrypto()
                .createHash('sha1')
                .update(key + WS_MAGIC_STRING)
                .digest('base64');
                
            if (acceptKey !== expectedKey) {
                const error = new Error('Invalid Sec-WebSocket-Accept header');
                this.readyState = WebSocket.CLOSED;
                this.emit('error', error);
                return;
            }
            
            // Set protocol
            const protocol = res.headers['sec-websocket-protocol'];
            if (protocol && this.protocols.includes(protocol)) {
                this.protocol = protocol;
            }
            
            this._socket = socket;
            this.readyState = WebSocket.OPEN;
            
            // Set up socket handlers
            socket.on('data', (data) => {
                this._handleData(data);
            });
            
            socket.on('close', () => {
                this.readyState = WebSocket.CLOSED;
                this.emit('close', this._closeCode || CLOSE_CODES.NO_STATUS_RECEIVED, this._closeReason || '');
            });
            
            socket.on('error', (err) => {
                // Convert error object using the same pattern as fs module
                const error = convertErrorObject(err);
                this.readyState = WebSocket.CLOSED;
                this.emit('error', error);
            });
            
            // Process any buffered data
            if (head && head.length > 0) {
                
                this._handleData(head);
            }
            
            
            this.emit('open');
        });
        
        req.end();
    }

    _handleData(data) {
        
        this._frameBuffer = Buffer.concat([this._frameBuffer, data]);
        
        while (this._frameBuffer.length > 0) {
            
            const frame = parseFrame(this._frameBuffer);
            if (!frame) {
                
                break; // Need more data
            }
            
            
            this._frameBuffer = this._frameBuffer.slice(frame.totalLength);
            this._processFrame(frame);
        }
    }

    _processFrame(frame) {
        
        
        switch (frame.opcode) {
            case OPCODES.TEXT:
            case OPCODES.BINARY:
                if (frame.fin) {
                    // Complete frame
                    if (frame.opcode === OPCODES.TEXT) {
                        const text = frame.payload.toString('utf8');
                        
                        this.emit('message', text, false);
                    } else {
                        
                        this.emit('message', frame.payload, true);
                    }
                } else {
                    // Start of fragmented message
                    this._fragmentOpcode = frame.opcode;
                    this._fragments = [frame.payload];
                }
                break;
                
            case OPCODES.CONTINUATION:
                if (this._fragmentOpcode === null) {
                    this._close(CLOSE_CODES.PROTOCOL_ERROR);
                    return;
                }
                
                this._fragments.push(frame.payload);
                
                if (frame.fin) {
                    // End of fragmented message
                    const completePayload = Buffer.concat(this._fragments);
                    
                    if (this._fragmentOpcode === OPCODES.TEXT) {
                        this.emit('message', completePayload.toString('utf8'), false);
                    } else {
                        this.emit('message', completePayload, true);
                    }
                    
                    this._fragments = [];
                    this._fragmentOpcode = null;
                }
                break;
                
            case OPCODES.PING:
                
                this._sendPong(frame.payload);
                this.emit('ping', frame.payload);
                break;
                
            case OPCODES.PONG:
                
                this.emit('pong', frame.payload);
                break;
                
            case OPCODES.CLOSE:
                let code = CLOSE_CODES.NO_STATUS_RECEIVED;
                let reason = '';
                
                if (frame.payload.length >= 2) {
                    code = frame.payload.readUInt16BE(0);
                    reason = frame.payload.slice(2).toString('utf8');
                }
                
                
                this._close(code, reason, false);
                this.emit('close', code, reason);
                break;
                
            default:
                
                this._close(CLOSE_CODES.PROTOCOL_ERROR);
                break;
        }
    }

    _read(size) {
        // Duplex stream interface - handled by frame processing
    }

    _write(chunk, encoding, callback) {
        if (this.readyState !== WebSocket.OPEN) {
            callback(new Error('WebSocket is not open'));
            return;
        }
        
        // Determine if data is binary or text
        const isBinary = Buffer.isBuffer(chunk);
        const opcode = isBinary ? OPCODES.BINARY : OPCODES.TEXT;
        const frame = createFrame(opcode, chunk, this._isClient);
        
        
        
        // Remove socket readyState check - HTTPS sockets don't use 'open' state
        if (this._socket && !this._socket.destroyed) {
            this._socket.write(frame, callback);
        } else {
            callback(new Error('Socket not writable'));
        }
    }

    send(data, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        
        options = options || {};
        callback = callback || (() => {});
        
        
        
        if (this.readyState !== WebSocket.OPEN) {
            
            callback(new Error('WebSocket is not open'));
            return;
        }
        
        const isBinary = options.binary || Buffer.isBuffer(data);
        const opcode = isBinary ? OPCODES.BINARY : OPCODES.TEXT;
        const frame = createFrame(opcode, data, this._isClient);
        
        
        
        
        // Remove socket readyState check - HTTPS sockets don't use 'open' state
        if (this._socket && !this._socket.destroyed) {
            
            
            // Try synchronous write first to see if that works
            const writeResult = this._socket.write(frame);
            
            
            if (callback) {
                // Call callback immediately since socket.write for TLS might not trigger callback properly
                setTimeout(() => callback(), 0);
            }
        } else {
            
            if (callback) callback(new Error('Socket not writable'));
        }
    }

    ping(data, callback) {
        if (typeof data === 'function') {
            callback = data;
            data = Buffer.alloc(0);
        }
        
        callback = callback || (() => {});
        data = data || Buffer.alloc(0);
        
        
        
        if (this.readyState !== WebSocket.OPEN) {
            
            callback(new Error('WebSocket is not open'));
            return;
        }
        
        const frame = createFrame(OPCODES.PING, data, this._isClient);
        
        
        
        
        // Remove socket readyState check - HTTPS sockets don't use 'open' state
        if (this._socket && !this._socket.destroyed) {
            
            
            // Try synchronous write for ping as well
            const writeResult = this._socket.write(frame);
            
            
            if (callback) {
                // Call callback immediately
                setTimeout(() => callback(), 0);
            }
        } else {
            
            callback(new Error('Socket not writable'));
        }
    }

    pong(data, callback) {
        if (typeof data === 'function') {
            callback = data;
            data = Buffer.alloc(0);
        }
        
        callback = callback || (() => {});
        data = data || Buffer.alloc(0);
        
        
        
        if (this.readyState !== WebSocket.OPEN) {
            
            callback(new Error('WebSocket is not open'));
            return;
        }
        
        const frame = createFrame(OPCODES.PONG, data, this._isClient);
        
        
        // Remove socket readyState check - HTTPS sockets don't use 'open' state
        if (this._socket && !this._socket.destroyed) {
            
            this._socket.write(frame, (err) => {
                if (err) {
                    
                } else {
                    
                }
                callback(err);
            });
        } else {
            
            callback(new Error('Socket not writable'));
        }
    }

    _sendPong(data) {
        
        if (this.readyState === WebSocket.OPEN) {
            const frame = createFrame(OPCODES.PONG, data || Buffer.alloc(0), this._isClient);
            
            
            // Remove socket readyState check - HTTPS sockets don't use 'open' state
            if (this._socket && !this._socket.destroyed) {
                
                this._socket.write(frame, (err) => {
                    if (err) {
                        
                    } else {
                        
                    }
                });
            } else {
                
            }
        } else {
            
        }
    }

    close(code, reason) {
        if (this.readyState === WebSocket.CLOSED) return;
        
        code = code || CLOSE_CODES.NORMAL;
        reason = reason || '';
        
        this._close(code, reason, true);
    }

    _close(code, reason, sendFrame) {
        if (this.readyState === WebSocket.CLOSED) return;
        
        this.readyState = WebSocket.CLOSING;
        
        if (sendFrame && this._socket && this._socket.readyState === 'open') {
            let payload = Buffer.alloc(0);
            if (code !== undefined) {
                payload = Buffer.allocUnsafe(2 + Buffer.byteLength(reason || ''));
                payload.writeUInt16BE(code, 0);
                if (reason) {
                    payload.write(reason, 2, 'utf8');
                }
            }
            
            const frame = createFrame(OPCODES.CLOSE, payload, this._isClient);
            this._socket.write(frame, () => {
                this._socket.end();
            });
        } else if (this._socket) {
            this._socket.end();
        }
        
        this.readyState = WebSocket.CLOSED;
    }

    terminate() {
        if (this.readyState === WebSocket.CLOSED) return;
        
        this.readyState = WebSocket.CLOSED;
        if (this._socket) {
            this._socket.destroy();
        }
    }
}

// WebSocket constants
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

// Server stub that throws ENOTSUP
class WebSocketServer extends getEventEmitter() {
    constructor(options) {
        super();
    }

    handleUpgrade() {
        const error = new Error('WebSocket server functionality not supported in serverless environment');
        error.code = 'ENOTSUP';
        throw error;
    }
}

WebSocket.Server = WebSocketServer;
WebSocket.WebSocketServer = WebSocketServer;

// Export as default and named exports
ws.WebSocket = WebSocket;
ws.default = WebSocket;
ws.WebSocketServer = WebSocketServer;
ws.Server = WebSocketServer;

// Constants
ws.CONNECTING = WebSocket.CONNECTING;
ws.OPEN = WebSocket.OPEN;
ws.CLOSING = WebSocket.CLOSING;
ws.CLOSED = WebSocket.CLOSED;

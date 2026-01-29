/**
 * Net Module Test Function
 * Tests TCP socket connectivity and data transfer with HTTP client
 */

const net = require('net');

module.exports = async function(req, res) {
    const results = {
        socketCreation: {},
        methodTests: {},
        httpClient: {},
        errors: []
    };

    try {
        // ===== Socket Creation Test =====
        console.log('Testing socket creation...');
        
        // Test that we can create a socket
        const testSocket = net.createConnection();
        results.socketCreation.created = true;
        results.socketCreation.isSocket = testSocket instanceof net.Socket;
        results.socketCreation.hasWrite = typeof testSocket.write === 'function';
        results.socketCreation.hasRead = typeof testSocket.read === 'function';
        results.socketCreation.hasDestroy = typeof testSocket.destroy === 'function';
        
        // Clean up the test socket without connecting
        testSocket.destroy();
        
        // ===== Socket Methods Test =====
        console.log('Testing socket methods...');
        
        const testSocket2 = net.createConnection();
        results.methodTests.hasWrite = typeof testSocket2.write === 'function';
        results.methodTests.hasRead = typeof testSocket2.read === 'function';
        results.methodTests.hasPause = typeof testSocket2.pause === 'function';
        results.methodTests.hasResume = typeof testSocket2.resume === 'function';
        results.methodTests.hasEnd = typeof testSocket2.end === 'function';
        results.methodTests.hasDestroy = typeof testSocket2.destroy === 'function';
        results.methodTests.hasSetTimeout = typeof testSocket2.setTimeout === 'function';
        results.methodTests.hasSetNoDelay = typeof testSocket2.setNoDelay === 'function';
        results.methodTests.hasSetKeepAlive = typeof testSocket2.setKeepAlive === 'function';
        
        // Test method chaining
        const chainTest = testSocket2.pause();
        results.methodTests.pauseReturnsSelf = chainTest === testSocket2;
        
        testSocket2.destroy();
        
        // ===== HTTP Client Test =====
        console.log('Testing HTTP client with socket...');
        
        const httpResult = await testHttpClient();
        results.httpClient = httpResult;
        
        // ===== Summary =====
        results.success = true;
        results.message = 'Net module functionality verified with HTTP client test';
        
    } catch (err) {
        results.success = false;
        results.error = err.message;
        results.stack = err.stack;
        results.errors.push(err.message);
    }

    console.log('Test results:', JSON.stringify(results, null, 2));
    res.json(results);
};

/**
 * Decode chunked transfer encoding
 * Extracts actual body content from chunk markers
 */
function decodeChunked(chunkedData) {
    console.log('decodeChunked input length:', chunkedData.length);
    console.log('decodeChunked input (first 200 chars):', chunkedData.substring(0, 200));
    
    let body = '';
    let i = 0;
    
    while (i < chunkedData.length) {
        // Find the end of chunk size line
        const sizeEnd = chunkedData.indexOf('\r\n', i);
        if (sizeEnd === -1) {
            console.log('No more \\r\\n found at position', i);
            break;
        }
        
        // Parse chunk size (hex) - ignore chunk extensions after `;`
        let sizeHex = chunkedData.substring(i, sizeEnd);
        console.log('Chunk size line:', JSON.stringify(sizeHex));
        
        const extensionIndex = sizeHex.indexOf(';');
        if (extensionIndex !== -1) {
            sizeHex = sizeHex.substring(0, extensionIndex);
        }
        
        const chunkSize = parseInt(sizeHex.trim(), 16);
        console.log('Parsed chunk size:', chunkSize);
        
        // If chunk size is 0 or invalid, we've reached the end
        if (isNaN(chunkSize) || chunkSize === 0) {
            console.log('Reached end of chunks');
            break;
        }
        
        // Extract chunk data
        const dataStart = sizeEnd + 2; // Skip \r\n
        const dataEnd = dataStart + chunkSize;
        const chunkData = chunkedData.substring(dataStart, dataEnd);
        console.log('Chunk data length:', chunkData.length, 'expected:', chunkSize);
        body += chunkData;
        
        // Move past the chunk data and its trailing \r\n
        i = dataEnd + 2;
    }
    
    console.log('Decoded body length:', body.length);
    return body;
}

/**
 * Simple HTTP client using net.Socket
 * Makes a GET request and receives response
 */
function testHttpClient() {
    return new Promise((resolve) => {
        const result = {
            requestSent: false,
            responseReceived: false,
            statusCode: null,
            headers: {},
            body: '',
            error: null,
            connectionEstablished: false,
            events: []
        };

        try {
            // Create socket connection to example.com
            const socket = net.createConnection(80, 'example.com', (err) => {
                if (err) {
                    result.error = `Connection callback error: ${err.message}`;
                    resolve(result);
                    return;
                }
                
                result.connectionEstablished = true;
                result.events.push('connect-callback');
                
                // Socket connected, send HTTP request
                const httpRequest = 'GET / HTTP/1.1\r\n' +
                    'Host: example.com\r\n' +
                    'Connection: close\r\n' +
                    'User-Agent: Invoke-Net-Test\r\n' +
                    '\r\n';
                
                socket.write(httpRequest, (writeErr) => {
                    if (writeErr) {
                        result.error = `Write error: ${writeErr.message}`;
                    } else {
                        result.requestSent = true;
                        result.events.push('write-complete');
                    }
                });
            });

            let responseData = '';
            let headersParsed = false;

            // Register listeners BEFORE connection happens
            socket.on('connect', () => {
                result.events.push('connect-event');
            });

            socket.on('data', (data) => {
                result.events.push('data-event');
                const chunk = data.toString('utf8');
                responseData += chunk;

                // Parse HTTP response if we haven't already
                if (!headersParsed) {
                    const headerEnd = responseData.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                        headersParsed = true;
                        result.responseReceived = true;

                        // Parse status line and headers
                        const headerText = responseData.substring(0, headerEnd);
                        const lines = headerText.split('\r\n');
                        
                        // Parse status line
                        if (lines.length > 0) {
                            const statusMatch = lines[0].match(/HTTP\/\d\.\d (\d+)/);
                            if (statusMatch) {
                                result.statusCode = parseInt(statusMatch[1]);
                            }
                        }
                        
                        // Parse headers
                        for (let i = 1; i < lines.length; i++) {
                            const headerMatch = lines[i].match(/^([^:]+):\s*(.+)$/);
                            if (headerMatch) {
                                result.headers[headerMatch[1].toLowerCase()] = headerMatch[2];
                            }
                        }
                    }
                }
            });

            socket.on('error', (err) => {
                result.error = err.message;
                result.events.push('error-event:' + err.message);
            });

            let resolved = false;
            let timeout;
            
            function doResolve() {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    try {
                        socket.destroy();
                    } catch (e) {
                        // Ignore errors during destroy
                    }
                    // Add a small delay to ensure resolve happens after destroy
                    setImmediate(() => resolve(result));
                }
            }
            
            socket.on('end', () => {
                result.events.push('end-event');
                
                // Extract body after all headers have been parsed
                const headerEnd = responseData.indexOf('\r\n\r\n');
                result.debugInfo = {
                    responseDataLength: responseData.length,
                    headerEndPosition: headerEnd,
                    responseDataFirst100: responseData.substring(0, 100),
                    hasChunkedHeader: result.headers['transfer-encoding'] === 'chunked'
                };
                
                if (headerEnd !== -1) {
                    let bodyData = responseData.substring(headerEnd + 4);
                    
                    // Store raw body for debugging
                    result.rawBody = bodyData.substring(0, 300);
                    
                    // Decode chunked encoding if present
                    if (result.headers['transfer-encoding'] === 'chunked') {
                        bodyData = decodeChunked(bodyData);
                    }
                    
                    result.body = bodyData.substring(0, 500);
                }
                
                result.totalDataReceived = responseData.length;
                doResolve();
            });

            socket.on('close', () => {
                result.events.push('close-event');
                result.totalDataReceived = responseData.length;
                doResolve();
            });

            // Set timeout for the request
            timeout = setTimeout(() => {
                result.error = 'Request timeout after 5 seconds';
                result.totalDataReceived = responseData.length;
                doResolve();
            }, 5000);

        } catch (err) {
            result.error = err.message;
            result.events.push('exception:' + err.message);
            resolve(result);
        }
    });
}

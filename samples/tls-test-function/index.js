/**
 * TLS Module Test Function
 * Tests TLS functionality including connection, certificate validation, and Node.js compatibility
 */

const tls = require('tls');

module.exports = async function(req, res) {
    const results = {
        moduleLoading: {},
        constantsAndProperties: {},
        certificateStore: {},
        tlsSocket: {},
        secureContext: {},
        serverStubs: {},
        compatibility: {},
        errors: []
    };

    try {
        // ===== Module Loading Test =====
        console.log('Testing TLS module loading...');
        
        results.moduleLoading.loaded = typeof tls === 'object';
        results.moduleLoading.hasConnect = typeof tls.connect === 'function';
        results.moduleLoading.hasCreateSecureContext = typeof tls.createSecureContext === 'function';
        results.moduleLoading.hasCheckServerIdentity = typeof tls.checkServerIdentity === 'function';
        results.moduleLoading.hasTLSSocket = typeof tls.TLSSocket === 'function';
        results.moduleLoading.hasConstants = typeof tls.constants === 'object';

        // ===== Constants and Properties Test =====
        console.log('Testing TLS constants and properties...');
        
        results.constantsAndProperties.hasRootCertificates = Array.isArray(tls.rootCertificates);
        results.constantsAndProperties.rootCertificatesCount = tls.rootCertificates ? tls.rootCertificates.length : 0;
        results.constantsAndProperties.hasDefaultMaxVersion = typeof tls.DEFAULT_MAX_VERSION === 'string';
        results.constantsAndProperties.hasDefaultMinVersion = typeof tls.DEFAULT_MIN_VERSION === 'string';
        results.constantsAndProperties.hasDefaultEcdhCurve = typeof tls.DEFAULT_ECDH_CURVE === 'string';
        
        // Test constants
        results.constantsAndProperties.hasTLS12Constant = typeof tls.constants.TLS1_2_VERSION === 'number';
        results.constantsAndProperties.hasTLS13Constant = typeof tls.constants.TLS1_3_VERSION === 'number';
        results.constantsAndProperties.hasCipherConstants = typeof tls.constants.TLS_AES_256_GCM_SHA384 === 'number';

        // ===== Certificate Store Test =====
        console.log('Testing certificate store...');
        
        try {
            const caCerts = tls.getCACertificates();
            results.certificateStore.getCACertificatesWorks = Array.isArray(caCerts);
            results.certificateStore.caCertCount = caCerts.length;
            results.certificateStore.firstCertIsPEM = caCerts.length > 0 && caCerts[0].includes('-----BEGIN CERTIFICATE-----');
            
            // Test different store types
            const bundledCerts = tls.getCACertificates('bundled');
            results.certificateStore.bundledCertsWork = Array.isArray(bundledCerts);
            
            const systemCerts = tls.getCACertificates('system');
            results.certificateStore.systemCertsWork = Array.isArray(systemCerts);
            
            // Test extra certs (should be empty if NODE_EXTRA_CA_CERTS not set)
            const extraCerts = tls.getCACertificates('extra');
            results.certificateStore.extraCertsWork = Array.isArray(extraCerts);
            results.certificateStore.extraCertsEmpty = extraCerts.length === 0;
        } catch (err) {
            results.certificateStore.error = err.message;
            results.errors.push(`Certificate store error: ${err.message}`);
        }

        // ===== TLS Socket Test =====
        console.log('Testing TLS socket creation...');
        
        try {
            const socket = new tls.TLSSocket();
            results.tlsSocket.creation = true;
            results.tlsSocket.isEventEmitter = typeof socket.on === 'function';
            results.tlsSocket.hasConnect = typeof socket.connect === 'function';
            results.tlsSocket.hasWrite = typeof socket.write === 'function';
            results.tlsSocket.hasEnd = typeof socket.end === 'function';
            results.tlsSocket.hasDestroy = typeof socket.destroy === 'function';
            
            // Test TLS-specific methods
            results.tlsSocket.hasGetCipher = typeof socket.getCipher === 'function';
            results.tlsSocket.hasGetProtocol = typeof socket.getProtocol === 'function';
            results.tlsSocket.hasGetPeerCertificate = typeof socket.getPeerCertificate === 'function';
            results.tlsSocket.hasAuthorized = typeof socket.authorized === 'boolean';
            results.tlsSocket.hasEncrypted = socket.encrypted === true;
            
            socket.destroy();
        } catch (err) {
            results.tlsSocket.creationError = err.message;
            results.errors.push(`TLS socket error: ${err.message}`);
        }

        // ===== Secure Context Test =====
        console.log('Testing secure context...');
        
        try {
            const context = tls.createSecureContext({});
            results.secureContext.creation = true;
            results.secureContext.hasSetCert = typeof context.setCert === 'function';
            results.secureContext.hasSetKey = typeof context.setKey === 'function';
            results.secureContext.hasAddCACert = typeof context.addCACert === 'function';
            results.secureContext.hasSetCiphers = typeof context.setCiphers === 'function';
        } catch (err) {
            results.secureContext.creationError = err.message;
            results.errors.push(`Secure context error: ${err.message}`);
        }

        // ===== Server Stub Test =====
        console.log('Testing server stubs...');
        
        try {
            tls.createServer();
            results.serverStubs.createServerShouldThrow = false;
        } catch (err) {
            results.serverStubs.createServerThrows = true;
            results.serverStubs.createServerError = err.message;
            results.serverStubs.createServerCode = err.code;
            results.serverStubs.createServerCorrectError = err.code === 'ENOTSUP';
        }

        try {
            new tls.Server();
            results.serverStubs.serverConstructorShouldThrow = false;
        } catch (err) {
            results.serverStubs.serverConstructorThrows = true;
            results.serverStubs.serverConstructorError = err.message;
            results.serverStubs.serverConstructorCode = err.code;
            results.serverStubs.serverConstructorCorrectError = err.code === 'ENOTSUP';
        }

        try {
            tls.createSecurePair();
            results.serverStubs.createSecurePairShouldThrow = false;
        } catch (err) {
            results.serverStubs.createSecurePairThrows = true;
            results.serverStubs.createSecurePairError = err.message;
            results.serverStubs.createSecurePairCode = err.code;
            results.serverStubs.createSecurePairCorrectError = err.code === 'ENOTSUP';
        }

        // ===== Compatibility Test =====
        console.log('Testing Node.js compatibility...');
        
        // Test checkServerIdentity
        try {
            const cert = {
                subject: { CN: 'example.com' },
                subjectaltname: 'DNS:example.com, DNS:*.example.com'
            };
            
            const validResult = tls.checkServerIdentity('example.com', cert);
            results.compatibility.checkServerIdentityValid = validResult === undefined;
            
            const invalidResult = tls.checkServerIdentity('badhost.com', cert);
            results.compatibility.checkServerIdentityInvalid = invalidResult instanceof Error;
            results.compatibility.checkServerIdentityErrorMessage = invalidResult ? invalidResult.message : null;
        } catch (err) {
            results.compatibility.checkServerIdentityError = err.message;
            results.errors.push(`checkServerIdentity error: ${err.message}`);
        }

        // Test connect method overloads
        try {
            // Test different connect overloads without actually connecting
            const socket1 = tls.connect(443, 'example.com', { servername: 'example.com' });
            results.compatibility.connectOverload1 = socket1 instanceof tls.TLSSocket;
            socket1.destroy();
            
            const socket2 = tls.connect({ port: 443, host: 'example.com' });
            results.compatibility.connectOverload2 = socket2 instanceof tls.TLSSocket;
            socket2.destroy();
            
            results.compatibility.connectOverloadsWork = true;
        } catch (err) {
            results.compatibility.connectOverloadsError = err.message;
            results.errors.push(`Connect overloads error: ${err.message}`);
        }

        // ===== Real TLS Connectivity Test =====
        console.log('Testing real TLS connectivity...');
        
        results.connectivity = {};
        
        // Test 1: Connect to httpbin.org and send HTTP request
        try {
            await new Promise((resolve, reject) => {
                const socket = tls.connect(443, 'httpbin.org', { 
                    servername: 'httpbin.org',
                    rejectUnauthorized: false  // Allow self-signed certificates for testing
                }, () => {
                    console.log('Connected to httpbin.org:443');
                    results.connectivity.httpbinConnect = true;
                    results.connectivity.httpbinAuthorized = socket.authorized;
                    results.connectivity.httpbinCipher = socket.getCipher();
                    results.connectivity.httpbinProtocol = socket.getProtocol();
                    
                    // Send HTTP GET request
                    const httpRequest = 'GET /json HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n';
                    socket.write(httpRequest);
                    console.log('Sent HTTP request');
                });
                
                let responseData = '';
                socket.on('data', (data) => {
                    responseData += data.toString();
                    console.log('Received data chunk:', data.length, 'bytes');
                });
                
                socket.on('close', () => {
                    console.log('Connection closed');
                    results.connectivity.httpbinResponseReceived = responseData.length > 0;
                    results.connectivity.httpbinResponseLength = responseData.length;
                    results.connectivity.httpbinValidHTTP = responseData.includes('HTTP/1.1 200') && responseData.includes('application/json');
                    resolve();
                });
                
                socket.on('error', (err) => {
                    console.error('httpbin.org connection error:', err);
                    results.connectivity.httpbinError = err.message;
                    results.errors.push(`httpbin.org connectivity error: ${err.message}`);
                    resolve(); // Don't fail the whole test
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    socket.destroy();
                    if (!results.connectivity.httpbinConnect) {
                        results.connectivity.httpbinTimeout = true;
                        console.log('httpbin.org connection timed out');
                    }
                    resolve();
                }, 10000);
            });
        } catch (err) {
            results.connectivity.httpbinTestError = err.message;
            results.errors.push(`httpbin.org test error: ${err.message}`);
        }
        
        // Test 2: Connect to example.com and verify certificate
        try {
            await new Promise((resolve, reject) => {
                const socket = tls.connect(443, 'example.com', { servername: 'example.com' }, () => {
                    console.log('Connected to example.com:443');
                    results.connectivity.exampleConnect = true;
                    results.connectivity.exampleAuthorized = socket.authorized;
                    
                    const cert = socket.getPeerCertificate(true);
                    results.connectivity.exampleCertificate = {
                        hasSubject: !!cert.subject,
                        hasIssuer: !!cert.issuer,
                        hasValidFrom: !!cert.valid_from,
                        hasValidTo: !!cert.valid_to,
                        subjectCN: cert.subject ? cert.subject.CN : null
                    };
                    
                    // Test server identity check
                    const identityCheck = tls.checkServerIdentity('example.com', cert);
                    results.connectivity.exampleIdentityValid = identityCheck === undefined;
                    
                    socket.destroy();
                    resolve();
                });
                
                socket.on('error', (err) => {
                    console.error('example.com connection error:', err);
                    results.connectivity.exampleError = err.message;
                    results.errors.push(`example.com connectivity error: ${err.message}`);
                    resolve();
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    socket.destroy();
                    if (!results.connectivity.exampleConnect) {
                        results.connectivity.exampleTimeout = true;
                        console.log('example.com connection timed out');
                    }
                    resolve();
                }, 10000);
            });
        } catch (err) {
            results.connectivity.exampleTestError = err.message;
            results.errors.push(`example.com test error: ${err.message}`);
        }
        
        // Test 3: Test invalid hostname (should fail certificate validation)
        try {
            await new Promise((resolve, reject) => {
                const socket = tls.connect(443, 'httpbin.org', { servername: 'invalid-hostname.com' }, () => {
                    console.log('Connected with invalid servername');
                    results.connectivity.invalidHostnameConnected = true;
                    results.connectivity.invalidHostnameAuthorized = socket.authorized;
                    results.connectivity.invalidHostnameAuthError = socket.authorizationError;
                    
                    socket.destroy();
                    resolve();
                });
                
                socket.on('error', (err) => {
                    console.log('Invalid hostname correctly failed:', err.message);
                    results.connectivity.invalidHostnameCorrectlyFailed = true;
                    results.connectivity.invalidHostnameError = err.message;
                    resolve();
                });
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    socket.destroy();
                    results.connectivity.invalidHostnameTimeout = true;
                    resolve();
                }, 5000);
            });
        } catch (err) {
            results.connectivity.invalidHostnameTestError = err.message;
            results.errors.push(`Invalid hostname test error: ${err.message}`);
        }

        // ===== Advanced Features Test =====
        console.log('Testing advanced features...');
        
        try {
            const socket = new tls.TLSSocket();
            
            // Test method chaining
            const chainResult = socket.setTimeout(5000);
            results.compatibility.methodChaining = chainResult === socket;
            
            // Test session methods
            results.compatibility.hasGetSession = typeof socket.getSession === 'function';
            results.compatibility.hasIsSessionReused = typeof socket.isSessionReused === 'function';
            results.compatibility.hasGetTLSTicket = typeof socket.getTLSTicket === 'function';
            
            // Test renegotiate (should not be supported)
            try {
                socket.renegotiate({});
                results.compatibility.renegotiateSupported = true;
            } catch (err) {
                results.compatibility.renegotiateThrows = true;
                results.compatibility.renegotiateError = err.code;
            }
            
            socket.destroy();
        } catch (err) {
            results.compatibility.advancedFeaturesError = err.message;
            results.errors.push(`Advanced features error: ${err.message}`);
        }

        // ===== Summary =====
        results.summary = {
            totalTests: Object.keys(results).length - 2, // Exclude errors and summary
            errorsCount: results.errors.length,
            moduleFullyLoaded: results.moduleLoading.loaded && 
                              results.moduleLoading.hasConnect && 
                              results.moduleLoading.hasTLSSocket,
            certificatesWorking: results.certificateStore.getCACertificatesWorks,
            serverStubsWorking: results.serverStubs.createServerThrows && 
                               results.serverStubs.serverConstructorThrows,
            compatibilityGood: results.compatibility.connectOverloadsWork && 
                              results.compatibility.checkServerIdentityValid,
            connectivityWorking: results.connectivity && (
                results.connectivity.httpbinConnect || 
                results.connectivity.exampleConnect
            ),
            realTLSFunctional: results.connectivity && 
                              results.connectivity.httpbinResponseReceived &&
                              results.connectivity.httpbinValidHTTP
        };

        console.log('TLS module testing completed.');

    } catch (err) {
        console.error('TLS test error:', err);
        results.errors.push(`Test framework error: ${err.message}`);
        results.testFrameworkError = err.message;
    }

    // Return results
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results, null, 2));
};
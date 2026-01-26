/**
 * Express.js Compatibility Test Function
 * Tests all req/res Express.js compatibility features
 * 
 * Test routes:
 * GET /                    - Show test menu
 * GET /req/cookies         - Test req.cookies
 * GET /req/is              - Test req.is()
 * GET /req/accepts         - Test req.accepts()
 * GET /req/param/:id       - Test req.param()
 * GET /req/xhr             - Test req.xhr
 * GET /req/info            - Test req.baseUrl, req.subdomains
 * GET /res/send-types      - Test res.send() with different types
 * GET /res/sendstatus/:code - Test res.sendStatus()
 * GET /res/json            - Test res.json()
 * GET /res/sendfile        - Test res.sendFile()
 * GET /res/download        - Test res.download()
 * GET /res/redirect        - Test res.redirect()
 * GET /res/type            - Test res.type()
 * GET /res/cookie          - Test res.cookie()
 * GET /res/clearcookie     - Test res.clearCookie()
 * GET /res/headers         - Test res.append(), res.location()
 * GET /res/render          - Test res.render() (should error)
 */

module.exports = function(req, res) {
    const path = req.path || req.url.split('?')[0];
    
    console.log('=== Express Compatibility Test ===');
    console.log('Path:', path);
    console.log('Method:', req.method);
    
    // Route handling
    if (path === '/' || path === '') {
        return showMenu(req, res);
    }
    
    // Request object tests
    if (path === '/req/cookies') {
        return testReqCookies(req, res);
    }
    
    if (path === '/req/is') {
        return testReqIs(req, res);
    }
    
    if (path === '/req/accepts') {
        return testReqAccepts(req, res);
    }
    
    if (path.startsWith('/req/param/')) {
        return testReqParam(req, res);
    }
    
    if (path === '/req/xhr') {
        return testReqXhr(req, res);
    }
    
    if (path === '/req/info') {
        return testReqInfo(req, res);
    }
    
    // Response object tests
    if (path === '/res/send-types') {
        return testResSendTypes(req, res);
    }
    
    if (path.startsWith('/res/sendstatus/')) {
        return testResSendStatus(req, res);
    }
    
    if (path === '/res/json') {
        return testResJson(req, res);
    }
    
    if (path === '/res/sendfile') {
        return testResSendFile(req, res);
    }
    
    if (path === '/res/download') {
        return testResDownload(req, res);
    }
    
    if (path === '/res/redirect') {
        return testResRedirect(req, res);
    }
    
    if (path === '/res/type') {
        return testResType(req, res);
    }
    
    if (path === '/res/cookie') {
        return testResCookie(req, res);
    }
    
    if (path === '/res/clearcookie') {
        return testResClearCookie(req, res);
    }
    
    if (path === '/res/headers') {
        return testResHeaders(req, res);
    }
    
    if (path === '/res/render') {
        return testResRender(req, res);
    }
    
    // 404
    res.status(404).json({ error: 'Route not found' });
};

// ============================================================================
// Test Menu
// ============================================================================
function showMenu(req, res) {
    const menu = `
<!DOCTYPE html>
<html>
<head>
    <title>Express.js Compatibility Tests</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        h1 { color: #333; }
        .section { margin: 20px 0; }
        .section h2 { color: #666; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .test-link { display: block; padding: 8px; margin: 5px 0; background: #f5f5f5; text-decoration: none; color: #0066cc; border-radius: 4px; }
        .test-link:hover { background: #e0e0e0; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>Express.js Compatibility Test Suite</h1>
    
    <div class="section">
        <h2>Request Object Tests</h2>
        <a class="test-link" href="./req/cookies">Test req.cookies - Parse Cookie header</a>
        <a class="test-link" href="./req/is">Test req.is() - Content-Type matching</a>
        <a class="test-link" href="./req/accepts">Test req.accepts() - Accept header negotiation</a>
        <a class="test-link" href="./req/param/123?name=test">Test req.param() - Get params from multiple sources</a>
        <a class="test-link" href="./req/xhr">Test req.xhr - Detect AJAX requests</a>
        <a class="test-link" href="./req/info">Test req.baseUrl & req.subdomains</a>
    </div>
    
    <div class="section">
        <h2>Response Object Tests</h2>
        <a class="test-link" href="./res/send-types">Test res.send() - Different data types</a>
        <a class="test-link" href="./res/sendstatus/200">Test res.sendStatus() - Quick status responses</a>
        <a class="test-link" href="./res/json">Test res.json() - JSON responses</a>
        <a class="test-link" href="./res/sendfile">Test res.sendFile() - Serve files</a>
        <a class="test-link" href="./res/download">Test res.download() - File downloads</a>
        <a class="test-link" href="./res/redirect">Test res.redirect() - HTTP redirects</a>
        <a class="test-link" href="./res/type">Test res.type() - Set Content-Type</a>
        <a class="test-link" href="./res/cookie">Test res.cookie() - Set cookies</a>
        <a class="test-link" href="./res/clearcookie">Test res.clearCookie() - Clear cookies</a>
        <a class="test-link" href="./res/headers">Test res.append() & res.location()</a>
        <a class="test-link" href="./res/render">Test res.render() - Should throw error</a>
    </div>
    
    <p style="margin-top: 40px; color: #666;">
        <strong>Note:</strong> Some tests require specific headers. Use browser DevTools or curl to inspect full responses.
    </p>
</body>
</html>
    `.trim();
    
    res.type('html').send(menu);
}

// ============================================================================
// Request Object Tests
// ============================================================================

function testReqCookies(req, res) {
    console.log('Testing req.cookies');
    console.log('Cookie header:', req.get('cookie'));
    console.log('Parsed cookies:', req.cookies);
    
    res.json({
        test: 'req.cookies',
        success: true,
        cookieHeader: req.get('cookie'),
        parsedCookies: req.cookies,
        cookieCount: Object.keys(req.cookies).length,
        instructions: [
            '1. First visit /res/cookie to set cookies',
            '2. Browser will store cookies and send them back on subsequent requests',
            '3. Then visit this page again to see parsed cookies',
            'OR use curl: curl -H "Cookie: session=abc123; user=john" <url>'
        ]
    });
}

function testReqIs(req, res) {
    console.log('Testing req.is()');
    
    const tests = {
        'json': req.is('json'),
        'application/json': req.is('application/json'),
        'html': req.is('html'),
        'text/*': req.is('text/*'),
        '*/json': req.is('*/json'),
        '*/*': req.is('*/*')
    };
    
    console.log('Content-Type:', req.get('content-type'));
    console.log('Tests:', tests);
    
    res.json({
        test: 'req.is()',
        success: true,
        contentType: req.get('content-type'),
        tests: tests,
        note: 'Send different Content-Type headers to test matching'
    });
}

function testReqAccepts(req, res) {
    console.log('Testing req.accepts()');
    
    const acceptHeader = req.get('accept');
    const allAccepted = req.accepts();
    const htmlAccepted = req.accepts('html');
    const jsonAccepted = req.accepts('json');
    const textAccepted = req.accepts('text/plain');
    const multipleAccepted = req.accepts(['json', 'html', 'xml']);
    
    console.log('Accept header:', acceptHeader);
    console.log('All accepted:', allAccepted);
    
    res.json({
        test: 'req.accepts()',
        success: true,
        acceptHeader: acceptHeader,
        allAcceptedTypes: allAccepted,
        tests: {
            'accepts("html")': htmlAccepted,
            'accepts("json")': jsonAccepted,
            'accepts("text/plain")': textAccepted,
            'accepts(["json", "html", "xml"])': multipleAccepted
        },
        note: 'Send different Accept headers to test content negotiation. Example: Accept: text/html,application/json;q=0.9'
    });
}

function testReqParam(req, res) {
    console.log('Testing req.param()');
    
    const id = req.param('id');
    const name = req.param('name');
    const missing = req.param('missing', 'default-value');
    
    console.log('id from params:', id);
    console.log('name from query:', name);
    console.log('missing with default:', missing);
    
    res.json({
        test: 'req.param()',
        success: true,
        params: req.params,
        query: req.query,
        body: req.body,
        results: {
            id: id,
            name: name,
            missingWithDefault: missing
        },
        note: 'req.param() checks params -> query -> body in order'
    });
}

function testReqXhr(req, res) {
    console.log('Testing req.xhr');
    console.log('X-Requested-With:', req.get('x-requested-with'));
    console.log('Is XHR:', req.xhr);
    
    res.json({
        test: 'req.xhr',
        success: true,
        isXhr: req.xhr,
        xRequestedWith: req.get('x-requested-with'),
        note: 'Send X-Requested-With: XMLHttpRequest header to test AJAX detection'
    });
}

function testReqInfo(req, res) {
    console.log('Testing req.baseUrl and req.subdomains');
    
    res.json({
        test: 'req.baseUrl & req.subdomains',
        success: true,
        baseUrl: req.baseUrl,
        subdomains: req.subdomains,
        hostname: req.hostname,
        host: req.get('host'),
        note: 'baseUrl is always empty in serverless. subdomains extracted from hostname'
    });
}

// ============================================================================
// Response Object Tests
// ============================================================================

function testResSendTypes(req, res) {
    console.log('Testing res.send() with different types');
    
    const type = req.query.type || 'a';
    
    switch(type) {
        case 'undefined':
            console.log('Sending undefined (should be 204)');
            return res.send(undefined);
        
        case 'null':
            console.log('Sending null');
            return res.send(null);
        
        case 'number':
            console.log('Sending number');
            return res.send(42);
        
        case 'boolean':
            console.log('Sending boolean');
            return res.send(true);
        
        case 'string':
            console.log('Sending string');
            return res.send('Hello World');
        
        case 'buffer':
            console.log('Sending Buffer');
            return res.send(Buffer.from('Binary data', 'utf8'));
        
        case 'array':
            console.log('Sending array');
            return res.send([1, 2, 3, 4, 5]);
        
        case 'object':
            console.log('Sending object');
            return res.send({ message: 'Object response', type: 'object' });
        
        default:
            return res.json({
                test: 'res.send() types',
                availableTypes: ['undefined', 'null', 'number', 'boolean', 'string', 'buffer', 'array', 'object'],
                usage: 'Add ?type=<type> to test different data types'
            });
    }
}

function testResSendStatus(req, res) {
    console.log('Testing res.sendStatus()');
    
    const code = parseInt(req.params.id || req.path.split('/').pop()) || 200;
    console.log('Sending status:', code);
    
    return res.sendStatus(code);
}

function testResJson(req, res) {
    console.log('Testing res.json()');
    
    const data = {
        test: 'res.json()',
        success: true,
        timestamp: new Date().toISOString(),
        data: {
            string: 'value',
            number: 123,
            boolean: true,
            null: null,
            array: [1, 2, 3],
            object: { nested: true }
        },
        note: 'Check Content-Type header should be application/json; charset=utf-8'
    };
    
    return res.json(data);
}

function testResSendFile(req, res) {
    console.log('Testing res.sendFile()');
    
    const filename = req.query.file || 'package.json';
    
    // Send file from current package directory (no callback support)
    try {
        res.sendFile(filename, { root: '/' });
        console.log('File sent successfully:', filename);
    } catch (err) {
        console.error('sendFile error:', err);
        res.status(500).json({ error: err.message });
    }
}

function testResDownload(req, res) {
    console.log('Testing res.download()');
    
    const filename = req.query.file || 'package.json';
    const downloadName = req.query.name || 'downloaded-file.json';
    
    try {
        res.download(filename, downloadName, { root: '/' });
        console.log('Download initiated:', downloadName);
    } catch (err) {
        console.error('download error:', err);
        res.status(500).json({ error: err.message });
    }
}

function testResRedirect(req, res) {
    console.log('Testing res.redirect()');
    
    const to = req.query.to || '/';
    const status = parseInt(req.query.status) || 302;
    
    console.log('Redirecting to:', to, 'with status:', status);
    
    if (req.query.status) {
        return res.redirect(status, to);
    } else {
        return res.redirect(to);
    }
}

function testResType(req, res) {
    console.log('Testing res.type()');
    
    const type = req.query.type || 'json';
    
    res.type(type);
    
    const data = {
        test: 'res.type()',
        success: true,
        typeSet: type,
        actualContentType: res.get('content-type'),
        note: 'Check Content-Type header. Try ?type=json, ?type=html, ?type=.js, etc.'
    };
    
    // Send as JSON regardless of type set (for demonstration)
    res.send(JSON.stringify(data));
}

function testResCookie(req, res) {
    console.log('Testing res.cookie()');
    
    // Set various cookies with different options
    res.cookie('simple', 'value123');
    res.cookie('withPath', 'pathValue', { path: '/api' });
    res.cookie('withMaxAge', 'expires-soon', { maxAge: 60000 }); // 60 seconds
    res.cookie('httpOnly', 'secure-value', { httpOnly: true });
    res.cookie('secure', 'https-only', { secure: true });
    res.cookie('sameSite', 'strict-value', { sameSite: 'Strict' });
    res.cookie('complex', { nested: 'object', array: [1, 2, 3] });
    
    res.json({
        test: 'res.cookie()',
        success: true,
        cookiesSet: [
            'simple=value123',
            'withPath=pathValue; Path=/api',
            'withMaxAge=expires-soon; Max-Age=60',
            'httpOnly=secure-value; HttpOnly',
            'secure=https-only; Secure',
            'sameSite=strict-value; SameSite=Strict',
            'complex=j:{...}; (JSON object)'
        ],
        note: 'Check Set-Cookie headers in response. Multiple cookies should be set.'
    });
}

function testResClearCookie(req, res) {
    console.log('Testing res.clearCookie()');
    
    res.clearCookie('simple');
    res.clearCookie('withPath', { path: '/api' });
    res.clearCookie('sessionId');
    
    res.json({
        test: 'res.clearCookie()',
        success: true,
        cookiesCleared: ['simple', 'withPath', 'sessionId'],
        note: 'Check Set-Cookie headers. Cookies should be expired (Expires=Thu, 01 Jan 1970)'
    });
}

function testResHeaders(req, res) {
    console.log('Testing res.append() and res.location()');
    
    // Test append with multiple values
    res.append('X-Custom-Header', 'value1');
    res.append('X-Custom-Header', 'value2');
    res.append('X-Another-Header', 'single-value');
    
    // Test location
    res.location('https://example.com/redirected');
    
    res.json({
        test: 'res.append() & res.location()',
        success: true,
        headers: {
            'X-Custom-Header': 'value1, value2 (appended)',
            'X-Another-Header': 'single-value',
            'Location': 'https://example.com/redirected'
        },
        note: 'Check response headers. X-Custom-Header should have comma-separated values.'
    });
}

function testResRender(req, res) {
    console.log('Testing res.render() - should throw error');
    
    try {
        res.render('template', { data: 'value' });
        
        // This should not execute
        res.json({
            test: 'res.render()',
            success: false,
            error: 'render() did not throw an error!'
        });
    } catch (error) {
        console.log('Error thrown as expected:', error.message);
        
        res.json({
            test: 'res.render()',
            success: true,
            errorThrown: true,
            errorMessage: error.message,
            note: 'res.render() correctly throws error in serverless environment'
        });
    }
}

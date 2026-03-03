// ============================================================================
// Express.js Request and Response Object implementation
// ============================================================================
(function () {
    // Helper to parse cookies from Cookie header
    function parseCookies(cookieHeader) {
        const cookies = {};
        if (!cookieHeader) return cookies;

        const pairs = cookieHeader.split(';');

        for (const pair of pairs) {
            const trimmed = pair.trim();
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;

            const name = trimmed.substring(0, eqIdx).trim();
            let value = trimmed.substring(eqIdx + 1).trim();

            // Handle quoted values
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            // Decode value
            try {
                cookies[name] = decodeURIComponent(value);
            } catch (e) {
                cookies[name] = value;
            }
        }

        return cookies;
    }

    // Helper to normalize MIME type for matching
    function normalizeMimeType(type) {
        if (!type) return '';
        const normalized = type.toLowerCase().split(';')[0].trim();
        return normalized;
    }

    // Helper to match MIME type with wildcards
    function matchMimeType(contentType, type) {
        const mime = require('mime-types');

        // Normalize content type
        const normalizedContent = normalizeMimeType(contentType);

        // Resolve type (could be extension, shorthand, or full type)
        let targetType = mime.lookup(type) || type;
        targetType = normalizeMimeType(targetType);

        if (!normalizedContent || !targetType) return false;

        // Exact match
        if (normalizedContent === targetType) return targetType;

        // Wildcard matching
        const [contentMain, contentSub] = normalizedContent.split('/');
        const [targetMain, targetSub] = targetType.split('/');

        // */* matches everything
        if (targetMain === '*' && targetSub === '*') return targetType;

        // type/* matches
        if (targetMain === contentMain && targetSub === '*') return targetType;

        // */subtype matches
        if (targetMain === '*' && targetSub === contentSub) return targetType;

        return false;
    }

    // Helper to parse Accept header with q-values
    function parseAcceptHeader(acceptHeader) {
        if (!acceptHeader) return [];

        const types = [];
        const parts = acceptHeader.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Extract MIME type and q-value
            const match = trimmed.match(/^\s*([^;]+)(?:;q=([0-9.]+))?\s*$/);
            if (!match) continue;

            const type = match[1].trim();
            const q = match[2] ? parseFloat(match[2]) : 1.0;

            if (isNaN(q) || q < 0 || q > 1) continue;

            // Calculate specificity (exact=3, partial=2, wildcard=1)
            let specificity = 1;
            if (type !== '*/*') {
                const [main, sub] = type.split('/');
                if (main !== '*' && sub !== '*') specificity = 3;
                else if (main !== '*' || sub !== '*') specificity = 2;
            }

            types.push({ type, quality: q, specificity });
        }

        // Sort by quality (desc) then specificity (desc)
        types.sort((a, b) => {
            if (b.quality !== a.quality) return b.quality - a.quality;
            return b.specificity - a.specificity;
        });

        return types;
    }

    globalThis._createReqObject = function (reqData) {
        const reqObj = {
            ...reqData,

            // Parse cookies from Cookie header
            cookies: parseCookies(reqData.headers['cookie']),

            // Express.js compatibility properties
            baseUrl: '',

            // Get header value (case-insensitive)
            get(headerName) {
                return this.headers[headerName.toLowerCase()];
            },

            // Alias for get()
            header(headerName) {
                return this.get(headerName);
            },

            // Check if request Content-Type matches type
            is(type) {
                const contentType = this.headers['content-type'];
                if (!contentType) return false;

                // Handle array of types
                if (Array.isArray(type)) {
                    for (const t of type) {
                        const match = matchMimeType(contentType, t);
                        if (match) return match;
                    }
                    return false;
                }

                return matchMimeType(contentType, type);
            },

            // Check what Accept types are acceptable
            accepts(types) {
                const acceptHeader = this.headers['accept'] || '*/*';
                const parsed = parseAcceptHeader(acceptHeader);

                // No argument - return all accepted types
                if (!types) {
                    return parsed.map(p => p.type);
                }

                // Single type string
                if (typeof types === 'string') {
                    types = [types];
                }

                // Match against provided types
                for (const acceptType of parsed) {
                    for (const providedType of types) {
                        if (matchMimeType(acceptType.type, providedType)) {
                            return providedType;
                        }
                    }
                }

                return false;
            },

            // Get parameter from params, query, or body
            param(name, defaultValue) {
                return this.params[name] ?? this.query[name] ?? this.body?.[name] ?? defaultValue;
            }
        };

        // Add xhr getter
        Object.defineProperty(reqObj, 'xhr', {
            get() {
                const val = this.get('x-requested-with');
                return val ? val.toLowerCase() === 'xmlhttprequest' : false;
            }
        });

        // Add subdomains getter
        Object.defineProperty(reqObj, 'subdomains', {
            get() {
                return [];
            }
        });

        return reqObj;
    };


    // ============================================================================
    // RESPONSE OBJECT - HTTP Response Interface
    // ============================================================================
    globalThis.res = {
        headersSent: false,

        status(code) {
            _resStatus.applySync(undefined, [code]);
            return this;
        },

        sendStatus(code) {
            const message = _httpStatusCodes[code] || 'Unknown';
            return this.status(code).type('txt').send(message);
        },

        json(data) {
            this.setHeader('content-type', 'application/json; charset=utf-8');
            return this.end(JSON.stringify(data));
        },

        send(data) {
            let uint8array;

            if (data === undefined) {
                // Send 204 No Content for undefined
                this.removeHeader('Content-Type');
                return this.status(204).end();
            }
            else if (data === null) {
                this.setHeader('content-type', 'text/plain; charset=utf-8');
                uint8array = Buffer.from('', 'utf8');
            }
            else if (typeof data === 'number') {
                this.setHeader('content-type', 'text/plain; charset=utf-8');
                uint8array = Buffer.from(String(data), 'utf8');
            }
            else if (typeof data === 'boolean') {
                this.setHeader('content-type', 'text/plain; charset=utf-8');
                uint8array = Buffer.from(String(data), 'utf8');
            }
            else if (Buffer.isBuffer(data)) {
                if (!this.get('content-type')) {
                    this.setHeader('content-type', 'application/octet-stream');
                }
                uint8array = data;
            }
            else if (typeof data === 'string') {
                if (!this.get('content-type')) {
                    this.setHeader('content-type', 'text/html; charset=utf-8');
                }
                uint8array = Buffer.from(data, 'utf8');
            }
            else if (Array.isArray(data) || typeof data === 'object') {
                this.setHeader('content-type', 'application/json; charset=utf-8');
                uint8array = Buffer.from(JSON.stringify(data), 'utf8');
            }

            return this.end(uint8array);
        },

        sendFile(path, options) {
            const fs = require('fs');
            const pathUtil = require('path');
            const mime = require('mime-types');

            // Handle argument overloading (options is optional)
            if (typeof options === 'function') {
                throw new Error('res.sendFile() callbacks are not supported in this environment. Use synchronous file operations.');
            }
            options = options || {};

            try {
                // Resolve path
                const root = options.root || '/';
                const filePath = pathUtil.resolve(root, path);

                // Read file synchronously as Buffer
                let data;
                try {
                    data = fs.readFileSync(filePath);
                } catch (readErr) {
                    const statusCode = readErr.code === 'ENOENT' ? 404 :
                        (readErr.code === 'EACCES' ? 403 : 500);
                    return this.sendStatus(statusCode);
                }

                // Get stats for metadata
                let stats;
                try {
                    stats = fs.statSync(filePath);
                } catch (statErr) {
                    // If stat fails but read succeeded, just skip metadata
                    stats = null;
                }

                // Set Content-Type
                const mimeType = mime.contentType(mime.lookup(filePath));
                if (mimeType) {
                    this.setHeader('Content-Type', mimeType);
                }

                // Set Content-Length
                this.setHeader('Content-Length', String(data.length));

                // Set Cache-Control if maxAge provided
                if (options.maxAge !== undefined && options.cacheControl !== false) {
                    const maxAgeSeconds = Math.floor(options.maxAge / 1000);
                    this.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
                }

                // Set Last-Modified if not disabled
                if (options.lastModified !== false && stats && stats.mtime) {
                    // mtime is serialized as ISO string by VFS bridge
                    const mtimeDate = typeof stats.mtime === 'string' ? new Date(stats.mtime) : stats.mtime;
                    this.setHeader('Last-Modified', mtimeDate.toUTCString());
                }

                // Merge custom headers
                if (options.headers) {
                    for (const [key, value] of Object.entries(options.headers)) {
                        this.setHeader(key, value);
                    }
                }

                // Send file data
                return this.send(data);
            } catch (err) {
                return this.status(500).send('Internal Server Error');
            }
        },

        download(path, filename, options) {
            const pathUtil = require('path');

            // Handle argument overloading
            if (typeof filename === 'function') {
                throw new Error('res.download() callbacks are not supported in this environment. Use synchronous file operations.');
            } else if (typeof options === 'function') {
                throw new Error('res.download() callbacks are not supported in this environment. Use synchronous file operations.');
            }

            options = options || {};
            filename = filename || pathUtil.basename(path);

            // Set Content-Disposition
            this.attachment(filename);

            // Send file
            return this.sendFile(path, options);
        },

        attachment(filename) {
            if (filename) {
                // RFC 5987 encoding for Unicode filenames
                const needsEncoding = /[^\x20-\x7E]/.test(filename);

                if (needsEncoding) {
                    const encoded = encodeURIComponent(filename);
                    this.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
                } else {
                    // Escape quotes in filename
                    const escaped = filename.replace(/"/g, '\\"');
                    this.setHeader('Content-Disposition', `attachment; filename="${escaped}"`);
                }
            } else {
                this.setHeader('Content-Disposition', 'attachment');
            }
            return this;
        },

        redirect(statusOrUrl, url) {
            let status = 302;
            let location;

            // Handle argument overloading
            if (typeof statusOrUrl === 'number') {
                status = statusOrUrl;
                location = url;
            } else {
                location = statusOrUrl;
            }

            // Handle 'back' keyword
            if (location === 'back') {
                location = req.get('Referrer') || req.get('Referer') || '/';
            }

            // Set Location header
            this.setHeader('Location', location);

            // Set status and send HTML response body
            this.status(status);
            this.type('html');

            const escapedUrl = location.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            return this.end(`<p>Found. Redirecting to <a href="${escapedUrl}">${escapedUrl}</a></p>`);
        },

        location(url) {
            this.setHeader('Location', url);
            return this;
        },

        type(type) {
            const mime = require('mime-types');
            const mimeType = mime.contentType(type);
            if (mimeType) {
                this.setHeader('Content-Type', mimeType);
            }
            return this;
        },

        contentType(type) {
            return this.type(type);
        },

        cookie(name, value, options) {
            options = options || {};

            // Encode value
            const encoder = options.encode || encodeURIComponent;
            let cookieValue;

            if (typeof value === 'object') {
                cookieValue = 'j:' + encoder(JSON.stringify(value));
            } else {
                cookieValue = encoder(String(value));
            }

            let cookie = `${name}=${cookieValue}`;

            // Add path (default /)
            cookie += `; Path=${options.path || '/'}`;

            // Add domain
            if (options.domain) {
                cookie += `; Domain=${options.domain}`;
            }

            // Add maxAge and expires
            if (options.maxAge !== undefined) {
                const maxAgeSeconds = Math.floor(options.maxAge / 1000);
                cookie += `; Max-Age=${maxAgeSeconds}`;

                // Also set Expires
                const expires = new Date(Date.now() + options.maxAge);
                cookie += `; Expires=${expires.toUTCString()}`;
            } else if (options.expires) {
                if (options.expires instanceof Date) {
                    cookie += `; Expires=${options.expires.toUTCString()}`;
                } else {
                    cookie += `; Expires=${new Date(options.expires).toUTCString()}`;
                }
            }

            // Add flags
            if (options.httpOnly) {
                cookie += '; HttpOnly';
            }

            if (options.secure) {
                cookie += '; Secure';
            }

            if (options.sameSite) {
                const sameSite = typeof options.sameSite === 'string'
                    ? options.sameSite
                    : (options.sameSite === true ? 'Strict' : '');
                if (sameSite) {
                    cookie += `; SameSite=${sameSite}`;
                }
            }

            this.append('Set-Cookie', cookie);
            return this;
        },

        clearCookie(name, options) {
            options = options || {};
            return this.cookie(name, '', {
                ...options,
                expires: new Date(1),
                maxAge: 0
            });
        },

        setHeader(name, value) {
            _resSetHeader.applySync(undefined, [String(name), String(value)]);
            return this;
        },

        set(name, value) {
            return this.setHeader(name, value);
        },

        get(name) {
            return _resGet.applySync(undefined, [String(name)]);
        },

        append(field, value) {
            _resAppendHeader.applySync(undefined, [String(field), String(value)]);
            return this;
        },

        removeHeader(name) {
            _resRemoveHeader.applySync(undefined, [String(name)]);
            return this;
        },

        writeHead(statusCode, statusMessage, headers) {
            // Handle argument overloading
            // writeHead(statusCode, headers)
            if (typeof statusMessage === 'object' && statusMessage !== null) {
                headers = statusMessage;
                statusMessage = undefined;
            }

            // Validate status code
            if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 999) {
                throw new Error('Invalid status code: ' + statusCode);
            }

            // Set status code
            this.status(statusCode);

            // Set headers if provided
            if (headers && typeof headers === 'object') {
                for (const [name, value] of Object.entries(headers)) {
                    if (Array.isArray(value)) {
                        // Handle multiple values for same header (like Set-Cookie)
                        for (const val of value) {
                            this.append(name, val);
                        }
                    } else {
                        this.setHeader(name, value);
                    }
                }
            }

            return this;
        },

        render(view, locals, callback) {
            throw new Error('res.render() not supported in serverless environment');
        },

        end(data) {
            this.headersSent = true;

            if (data !== undefined) {
                let uint8array;
                if (Buffer.isBuffer(data)) {
                    uint8array = data;
                } else {
                    uint8array = Buffer.from(String(data), 'utf8');
                }
                // Use externalCopy option to automatically wrap ArrayBuffer in ExternalCopy
                _resEnd.applySync(undefined, [uint8array.buffer], { arguments: { externalCopy: true } });
            } else {
                _resEnd.applySync(undefined, [null]);
            }
            return this;
        },

        async pipeFrom(fetchResponse) {
            const blacklistedHeaders = ['transfer-encoding', 'content-length', 'connection', 'content-encoding'];

            // Copy headers from fetch response to Express res
            fetchResponse.headers.forEach((value, key) => {
                if (blacklistedHeaders.includes(key.toLowerCase())) return; // Skip hop-by-hop headers
                this.setHeader(key, value);
            });

            // Set status code
            this.status(fetchResponse.status);

            // Stream body directly
            const body = await fetchResponse.arrayBuffer();
            this.end(Buffer.from(body));
        }
    };

})();
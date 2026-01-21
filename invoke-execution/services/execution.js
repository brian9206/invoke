const { VM } = require('vm2');
const fs = require('fs-extra');
const path = require('path');
const db = require('./database');
const cache = require('./cache');

/**
 * Shared Function Execution Service
 * Provides unified execution logic for both regular HTTP calls and scheduled functions
 */

/**
 * Convert a virtual path to a real filesystem path
 * @param {string} virtualPath - Virtual path (absolute or relative)
 * @param {string} packageDir - Real package directory
 * @returns {string} Real filesystem path
 * @throws {Error} If path escapes package directory
 */
function virtualToReal(virtualPath, packageDir) {
    // Normalize the virtual path (convert to absolute)
    let targetPath;
    if (virtualPath.startsWith('/')) {
        // Absolute virtual path
        targetPath = path.join(packageDir, virtualPath.slice(1));
    } else {
        // Relative virtual path
        targetPath = path.resolve(packageDir, virtualPath);
    }
    
    // Normalize and check boundaries
    const normalizedTarget = path.normalize(targetPath);
    const normalizedPackage = path.normalize(packageDir);
    
    // Security check: ensure we stay within package directory
    if (!normalizedTarget.startsWith(normalizedPackage)) {
        throw new Error(`Access denied: Path escapes package directory`);
    }
    
    return normalizedTarget;
}

/**
 * Convert a real filesystem path to a virtual path
 * @param {string} realPath - Real filesystem path
 * @param {string} packageDir - Real package directory
 * @returns {string} Virtual path rooted at /
 */
function realToVirtual(realPath, packageDir) {
    const normalizedReal = path.normalize(realPath);
    const normalizedPackage = path.normalize(packageDir);
    
    // If path equals package directory, return /
    if (normalizedReal === normalizedPackage) {
        return '/';
    }
    
    // Strip package directory prefix and add leading /
    let virtualPath = normalizedReal;
    if (normalizedReal.startsWith(normalizedPackage)) {
        virtualPath = normalizedReal.slice(normalizedPackage.length);
    }
    
    // Ensure forward slashes
    virtualPath = virtualPath.replace(/\\/g, '/');
    
    // Ensure leading /
    if (!virtualPath.startsWith('/')) {
        virtualPath = '/' + virtualPath;
    }
    
    return virtualPath;
}

/**
 * Sanitize error messages to hide real paths
 * @param {Error} error - Error object
 * @param {string} packageDir - Real package directory
 * @returns {Error} Error with sanitized message
 */
function sanitizeErrorMessage(error, packageDir) {
    const normalizedPackage = path.normalize(packageDir);
    error.message = error.message.replace(new RegExp(normalizedPackage, 'g'), '/');
    // Also handle forward slash versions
    error.message = error.message.replace(new RegExp(normalizedPackage.replace(/\\/g, '/'), 'g'), '/');
    return error;
}

/**
 * Sanitize stack trace to hide real paths
 * @param {string} stack - Stack trace string
 * @param {string} packageDir - Real package directory
 * @returns {string} Sanitized stack trace
 */
function sanitizeStackTrace(stack, packageDir) {
    if (!stack || typeof stack !== 'string') {
        return stack;
    }
    
    let sanitized = stack;
    
    // First, replace user's package directory with virtual root
    const normalizedPackage = path.normalize(packageDir);
    sanitized = sanitized.replace(new RegExp(normalizedPackage.replace(/\\/g, '\\\\'), 'g'), '/');
    // Also handle forward slash versions
    sanitized = sanitized.replace(new RegExp(normalizedPackage.replace(/\\/g, '/'), 'g'), '/');
    
    // Then, strip all remaining absolute paths to prevent information leakage
    // Remove Windows absolute paths with line numbers: C:\path\to\file.js:123:45
    sanitized = sanitized.replace(/[A-Z]:\\[^\s)]+\.(js|ts|json|mjs|cjs)(:\d+:\d+)?/g, '<internal>');
    // Remove any remaining Windows paths: C:\path\to\file
    sanitized = sanitized.replace(/[A-Z]:\\[^\s)]+/g, '<internal>');
    // Remove Unix absolute paths: /path/to/file.js (but not single / or virtual paths)
    sanitized = sanitized.replace(/\/(?:[^\/\s)]+\/)+[^\s)]+\.(js|ts|json|mjs|cjs)(:\d+:\d+)?/g, '<internal>');
    
    return sanitized;
}

/**
 * Create a wrapped Error constructor that sanitizes stack traces
 * @param {string} packageDir - Real package directory
 * @returns {Function} Wrapped Error constructor
 */
function createErrorConstructor(packageDir) {
    // Wrap the native Error constructor
    const WrappedError = function(message) {
        const error = new Error(message);
        
        // Define a getter for the stack property that sanitizes on access
        const originalStack = error.stack;
        Object.defineProperty(error, 'stack', {
            get() {
                return sanitizeStackTrace(originalStack, packageDir);
            },
            set(value) {
                // Allow setting but sanitize when getting
                Object.defineProperty(error, 'stack', {
                    get() {
                        return sanitizeStackTrace(value, packageDir);
                    },
                    set(newValue) {
                        this._customStack = newValue;
                    },
                    configurable: true,
                    enumerable: false
                });
            },
            configurable: true,
            enumerable: false
        });
        
        return error;
    };
    
    // Copy static methods
    WrappedError.captureStackTrace = function(targetObject, constructorOpt) {
        const originalStack = Error.captureStackTrace.call(Error, targetObject, constructorOpt);
        
        // Define getter for sanitized stack on the target object
        const stackValue = targetObject.stack;
        Object.defineProperty(targetObject, 'stack', {
            get() {
                return sanitizeStackTrace(stackValue, packageDir);
            },
            set(value) {
                Object.defineProperty(targetObject, 'stack', {
                    get() {
                        return sanitizeStackTrace(value, packageDir);
                    },
                    set(newValue) {
                        this._customStack = newValue;
                    },
                    configurable: true,
                    enumerable: false
                });
            },
            configurable: true,
            enumerable: false
        });
        
        return originalStack;
    };
    
    WrappedError.stackTraceLimit = Error.stackTraceLimit;
    
    return WrappedError;
}

/**
 * Create a virtualized fs module proxy
 * @param {string} packageDir - Real package directory
 * @returns {Object} Virtualized fs object
 */
function createFsProxy(packageDir) {
    const blockedOperations = [
        'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
        'unlink', 'unlinkSync', 'mkdir', 'mkdirSync', 'rmdir', 'rmdirSync',
        'rm', 'rmSync', 'chmod', 'chmodSync', 'chown', 'chownSync',
        'symlink', 'symlinkSync', 'link', 'linkSync',
        'readlink', 'readlinkSync', 'lstat', 'lstatSync',
        'truncate', 'truncateSync', 'ftruncate', 'ftruncateSync',
        'copyFile', 'copyFileSync', 'rename', 'renameSync'
    ];
    
    const proxy = {
        // Synchronous read operations
        readFileSync(filePath, encoding = 'utf8') {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return fs.readFileSync(realPath, encoding);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        readdirSync(dirPath, options) {
            try {
                const realPath = virtualToReal(dirPath, packageDir);
                return fs.readdirSync(realPath, options);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        statSync(filePath) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return fs.statSync(realPath);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        existsSync(filePath) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return fs.existsSync(realPath);
            } catch {
                return false;
            }
        },
        
        accessSync(filePath, mode) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return fs.accessSync(realPath, mode);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        // Asynchronous read operations with callback
        readFile(filePath, encodingOrCallback, callback) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
                const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
                
                fs.readFile(realPath, encoding, (err, data) => {
                    if (err) {
                        err = sanitizeErrorMessage(err, packageDir);
                    }
                    actualCallback(err, data);
                });
            } catch (err) {
                const wrappedCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
                wrappedCallback(sanitizeErrorMessage(err, packageDir));
            }
        },
        
        readdir(dirPath, optionsOrCallback, callback) {
            try {
                const realPath = virtualToReal(dirPath, packageDir);
                const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
                const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
                
                fs.readdir(realPath, options, (err, files) => {
                    if (err) {
                        err = sanitizeErrorMessage(err, packageDir);
                    }
                    actualCallback(err, files);
                });
            } catch (err) {
                const wrappedCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
                wrappedCallback(sanitizeErrorMessage(err, packageDir));
            }
        },
        
        stat(filePath, callback) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                fs.stat(realPath, (err, stats) => {
                    if (err) {
                        err = sanitizeErrorMessage(err, packageDir);
                    }
                    callback(err, stats);
                });
            } catch (err) {
                callback(sanitizeErrorMessage(err, packageDir));
            }
        },
        
        access(filePath, modeOrCallback, callback) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
                const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
                
                fs.access(realPath, mode, (err) => {
                    if (err) {
                        err = sanitizeErrorMessage(err, packageDir);
                    }
                    actualCallback(err);
                });
            } catch (err) {
                const wrappedCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
                wrappedCallback(sanitizeErrorMessage(err, packageDir));
            }
        },
        
        // Promise-based operations
        promises: null // Will be set after proxy creation
    };
    
    // Block write/modify operations
    blockedOperations.forEach(op => {
        proxy[op] = function() {
            const error = new Error('EACCES: permission denied');
            error.code = 'EACCES';
            error.errno = -13;
            error.syscall = op;
            throw error;
        };
    });
    
    return proxy;
}

/**
 * Create a virtualized fs/promises module proxy
 * @param {string} packageDir - Real package directory
 * @returns {Object} Virtualized fs/promises object
 */
function createFsPromisesProxy(packageDir) {
    const blockedOperations = [
        'writeFile', 'appendFile', 'unlink', 'mkdir', 'rmdir',
        'rm', 'chmod', 'chown', 'symlink', 'link',
        'readlink', 'lstat', 'truncate', 'ftruncate',
        'copyFile', 'rename'
    ];
    
    const proxy = {
        async readFile(filePath, encoding = 'utf8') {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return await fs.promises.readFile(realPath, encoding);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        async readdir(dirPath, options) {
            try {
                const realPath = virtualToReal(dirPath, packageDir);
                return await fs.promises.readdir(realPath, options);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        async stat(filePath) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return await fs.promises.stat(realPath);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        async access(filePath, mode) {
            try {
                const realPath = virtualToReal(filePath, packageDir);
                return await fs.promises.access(realPath, mode);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        }
    };
    
    // Block write/modify operations
    blockedOperations.forEach(op => {
        proxy[op] = async function() {
            const error = new Error('EACCES: permission denied');
            error.code = 'EACCES';
            error.errno = -13;
            error.syscall = op;
            throw error;
        };
    });
    
    return proxy;
}

/**
 * Create a virtualized path module proxy
 * @param {string} packageDir - Real package directory
 * @returns {Object} Virtualized path object
 */
function createPathProxy(packageDir) {
    const nativePath = require('path');
    
    // Helper to convert real paths to virtual in results
    const toVirtual = (p) => {
        if (typeof p === 'string') {
            return realToVirtual(p, packageDir);
        }
        return p;
    };
    
    const proxy = {
        resolve(...args) {
            try {
                // Resolve virtual path arguments to real, then convert back to virtual
                const realArgs = args.map(arg => {
                    if (typeof arg !== 'string') return arg;
                    return virtualToReal(arg, packageDir);
                });
                const realResult = nativePath.resolve(...realArgs);
                return realToVirtual(realResult, packageDir);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        join(...args) {
            try {
                const realArgs = args.map(arg => {
                    if (typeof arg !== 'string') return arg;
                    return virtualToReal(arg, packageDir);
                });
                const realResult = nativePath.join(...realArgs);
                return realToVirtual(realResult, packageDir);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        normalize(p) {
            try {
                const realPath = virtualToReal(p, packageDir);
                const realResult = nativePath.normalize(realPath);
                return realToVirtual(realResult, packageDir);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        dirname(p) {
            try {
                const realPath = virtualToReal(p, packageDir);
                const realResult = nativePath.dirname(realPath);
                return realToVirtual(realResult, packageDir);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        basename(p, ext) {
            try {
                const realPath = virtualToReal(p, packageDir);
                return nativePath.basename(realPath, ext);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        relative(from, to) {
            try {
                const realFrom = virtualToReal(from, packageDir);
                const realTo = virtualToReal(to, packageDir);
                const result = nativePath.relative(realFrom, realTo);
                // Prefix with / if the result is not empty and not already starting with /
                return result ? '/' + result : '/';
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        isAbsolute(p) {
            // In virtual filesystem, paths starting with / are absolute
            return typeof p === 'string' && p.startsWith('/');
        },
        
        extname(p) {
            try {
                const realPath = virtualToReal(p, packageDir);
                return nativePath.extname(realPath);
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        parse(p) {
            try {
                const virtualPath = realToVirtual(virtualToReal(p, packageDir), packageDir);
                // Parse the virtual path
                const parsed = nativePath.posix.parse(virtualPath);
                return parsed;
            } catch (error) {
                if (error instanceof Error) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
        },
        
        format(pathObj) {
            // Format using POSIX (forward slashes)
            return nativePath.posix.format(pathObj);
        },
        
        // Properties
        sep: '/',
        delimiter: ':',
        
        // POSIX-style path methods
        posix: null, // Will be set below
        win32: null  // Will be set below
    };
    
    // Set up posix and win32 objects to also use virtual paths
    proxy.posix = { ...proxy };
    proxy.win32 = { ...proxy };
    
    return proxy;
}

/**
 * Create a virtualized os module proxy
 * @returns {Object} Virtualized os object
 */
function createOsProxy() {
    const nativeOs = require('os');
    
    return {
        tmpdir() {
            return '/';
        },
        
        homedir() {
            return '/';
        },
        
        setPriority(...args) {
            const error = new Error('EACCES: operation not permitted');
            error.code = 'EACCES';
            error.errno = -13;
            error.syscall = 'setPriority';
            throw error;
        },
        
        getPriority(...args) {
            const error = new Error('EACCES: operation not permitted');
            error.code = 'EACCES';
            error.errno = -13;
            error.syscall = 'getPriority';
            throw error;
        },
        
        // Safe methods - pass through to native
        platform: () => nativeOs.platform(),
        arch: () => nativeOs.arch(),
        cpus: () => nativeOs.cpus(),
        totalmem: () => nativeOs.totalmem(),
        freemem: () => nativeOs.freemem(),
        uptime: () => nativeOs.uptime(),
        type: () => nativeOs.type(),
        release: () => nativeOs.release(),
        endianness: () => nativeOs.endianness(),
        loadavg: () => nativeOs.loadavg(),
        hostname: () => nativeOs.hostname(),
        networkInterfaces: () => nativeOs.networkInterfaces(),
        EOL: nativeOs.EOL
    };
}

/**
 * Check if an IP address is in a private/internal range
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP is private/internal
 */
function isPrivateIP(ip) {
    // Handle IPv4
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length !== 4) return false;
        const octets = parts.map(p => parseInt(p, 10));
        
        if (isNaN(octets[0]) || isNaN(octets[1]) || isNaN(octets[2]) || isNaN(octets[3])) {
            return false;
        }
        
        // 127.0.0.0/8 (loopback)
        if (octets[0] === 127) return true;
        
        // 10.0.0.0/8 (private)
        if (octets[0] === 10) return true;
        
        // 172.16.0.0/12 (private)
        if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
        
        // 192.168.0.0/16 (private)
        if (octets[0] === 192 && octets[1] === 168) return true;
        
        // 169.254.0.0/16 (link-local)
        if (octets[0] === 169 && octets[1] === 254) return true;
        
        // 0.0.0.0/8 (current network)
        if (octets[0] === 0) return true;
        
        // 255.255.255.255 (broadcast)
        if (octets[0] === 255 && octets[1] === 255 && octets[2] === 255 && octets[3] === 255) return true;
    }
    
    // Handle IPv6
    if (ip.includes(':')) {
        const normalizedIp = ip.toLowerCase();
        
        // ::1 (loopback)
        if (normalizedIp === '::1') return true;
        
        // fc00::/7 (unique local addresses)
        if (normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd')) return true;
        
        // fe80::/10 (link-local)
        if (normalizedIp.startsWith('fe80:')) return true;
        
        // ::ffff:127.0.0.0/104 (IPv4 loopback mapped)
        if (normalizedIp.startsWith('::ffff:127.')) return true;
        
        // ::ffff:10.0.0.0/100 (IPv4 private mapped)
        if (normalizedIp.startsWith('::ffff:10.')) return true;
        
        // ::ffff:172.16.0.0/108 (IPv4 private mapped)
        if (normalizedIp.startsWith('::ffff:172.')) {
            const ipv4Part = normalizedIp.slice(7);
            const parts = ipv4Part.split('.');
            if (parts.length === 4) {
                const octet = parseInt(parts[0], 10);
                if (octet === 172) {
                    const octet2 = parseInt(parts[1], 10);
                    if (octet2 >= 16 && octet2 <= 31) return true;
                }
            }
        }
        
        // ::ffff:192.168.0.0/112 (IPv4 private mapped)
        if (normalizedIp.startsWith('::ffff:192.168.')) return true;
        
        // :: (all zeros / any address)
        if (normalizedIp === '::') return true;
    }
    
    return false;
}

/**
 * Check if an IP address is localhost
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP is localhost
 */
function isLocalhostIP(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

/**
 * Check if an IP address is blocked (private or localhost)
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP should be blocked
 */
function isBlockedIP(ip) {
    return isPrivateIP(ip) || isLocalhostIP(ip);
}

/**
 * Validate hostname by DNS resolution and IP check
 * @param {string} hostname - Hostname to validate
 * @returns {Promise<boolean>} True if hostname resolves to allowed external IP
 * @throws {Error} If hostname is blocked or DNS resolution fails
 */
async function validateHostname(hostname) {
    // Check if hostname is an IP literal
    if (isBlockedIP(hostname)) {
        throw new Error('Access to internal networks is not allowed');
    }
    
    try {
        const dns = require('dns').promises;
        
        // Set timeout for DNS resolution
        const resolutionPromise = dns.lookup(hostname, { all: true });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DNS resolution timeout')), 5000)
        );
        
        const addresses = await Promise.race([resolutionPromise, timeoutPromise]);
        
        // Check all resolved addresses
        if (Array.isArray(addresses)) {
            for (const addr of addresses) {
                if (isBlockedIP(addr.address)) {
                    throw new Error('Access to internal networks is not allowed');
                }
            }
        } else if (isBlockedIP(addresses.address)) {
            throw new Error('Access to internal networks is not allowed');
        }
        
        return true;
    } catch (error) {
        // Re-throw with clearer message if it's our block
        if (error.message === 'Access to internal networks is not allowed') {
            throw error;
        }
        // For DNS errors, provide a generic message
        throw new Error(`Failed to resolve hostname: ${error.message}`);
    }
}

/**
 * Create a secure fetch proxy with network access controls
 * @param {string} packageDir - Real package directory for error sanitization
 * @returns {Function} Secure fetch function
 */
function createSecureFetchProxy(packageDir) {
    const nativeFetch = global.fetch;
    
    if (!nativeFetch) {
        throw new Error('fetch is not available in this Node.js version. Requires Node 18+');
    }
    
    const MAX_REDIRECTS = 20;
    
    /**
     * Follow redirects manually with validation
     */
    async function fetchWithRedirects(url, options, redirectCount = 0) {
        // Validate hostname before making request
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        await validateHostname(hostname);
        
        // Make the request
        const response = await nativeFetch(url, options);
        
        // Handle redirects if redirect mode is 'follow'
        const redirectMode = options?.redirect || 'follow';
        
        if (redirectMode === 'follow' && response.status >= 300 && response.status < 400) {
            // Check redirect limit
            if (redirectCount >= MAX_REDIRECTS) {
                throw new Error('Maximum redirect limit reached');
            }
            
            const locationHeader = response.headers.get('location');
            if (!locationHeader) {
                // No location header, return as-is
                return response;
            }
            
            // Resolve relative URLs
            let redirectUrl;
            try {
                // If location is absolute, use it directly
                if (locationHeader.startsWith('http://') || locationHeader.startsWith('https://')) {
                    redirectUrl = locationHeader;
                } else {
                    // Resolve relative to current URL
                    redirectUrl = new URL(locationHeader, url).href;
                }
            } catch (error) {
                throw new Error(`Invalid redirect URL: ${error.message}`);
            }
            
            // Validate the redirect target hostname
            const redirectUrlObj = new URL(redirectUrl);
            const redirectHostname = redirectUrlObj.hostname;
            
            await validateHostname(redirectHostname);
            
            // Determine method for redirect (follow HTTP redirect semantics)
            let redirectMethod = options?.method || 'GET';
            let redirectBody = options?.body;
            
            // 303 always uses GET
            if (response.status === 303) {
                redirectMethod = 'GET';
                redirectBody = undefined;
            }
            // 301/302 typically change to GET, but spec allows preserving method
            else if ((response.status === 301 || response.status === 302) && redirectMethod === 'POST') {
                redirectMethod = 'GET';
                redirectBody = undefined;
            }
            // 307/308 preserve method and body
            
            // Follow the redirect
            const redirectOptions = {
                ...options,
                method: redirectMethod,
                body: redirectBody,
                redirect: 'manual' // Prevent automatic following to use our validation
            };
            
            return fetchWithRedirects(redirectUrl, redirectOptions, redirectCount + 1);
        }
        
        return response;
    }
    
    // Return the secure fetch function
    return async function secureFetch(resource, options) {
        try {
            // Handle both string URLs and Request objects
            let url;
            let fetchOptions = options || {};
            
            if (typeof resource === 'string') {
                url = resource;
            } else if (resource instanceof URL) {
                url = resource.href;
            } else if (typeof resource === 'object' && resource.url) {
                // Request object
                url = resource.url;
                // Copy properties from Request if not in options
                if (!options) {
                    fetchOptions = {
                        method: resource.method,
                        headers: resource.headers,
                        body: resource.body,
                        redirect: resource.redirect
                    };
                }
            } else {
                throw new Error('Invalid fetch resource');
            }
            
            // Validate URL
            let urlObj;
            try {
                urlObj = new URL(url);
            } catch (error) {
                throw new Error(`Invalid URL: ${error.message}`);
            }
            
            // Force redirect to 'manual' and handle it ourselves for validation
            const originalRedirect = fetchOptions.redirect || 'follow';
            const finalOptions = {
                ...fetchOptions,
                redirect: 'manual'
            };
            
            // Use custom redirect handling if redirect mode is 'follow'
            if (originalRedirect === 'follow') {
                return await fetchWithRedirects(url, finalOptions, 0);
            } else if (originalRedirect === 'error') {
                // For 'error' mode, validate and let fetch handle it
                await validateHostname(urlObj.hostname);
                const response = await nativeFetch(url, { ...finalOptions, redirect: 'error' });
                return response;
            } else if (originalRedirect === 'manual') {
                // For 'manual' mode, just validate and make request
                await validateHostname(urlObj.hostname);
                const response = await nativeFetch(url, finalOptions);
                return response;
            } else {
                throw new Error(`Invalid redirect option: ${originalRedirect}`);
            }
        } catch (error) {
            // Ensure errors are proper Error objects and sanitize stacks
            if (error instanceof Error) {
                if (packageDir) {
                    error.stack = sanitizeStackTrace(error.stack, packageDir);
                }
                throw error;
            }
            throw new Error(String(error));
        }
    };
}

/**
 * Get function package with caching
 * @param {string} functionId - Function ID
 * @returns {Object} Package information
 */
async function getFunctionPackage(functionId) {
    try {
        // Get function metadata from database first
        const functionData = await fetchFunctionMetadata(functionId);
        
        // Check cache with hash verification
        const cacheResult = await cache.checkCache(functionId, functionData.package_hash, functionData.version);
        
        if (cacheResult.cached && cacheResult.valid) {
            await cache.updateAccessStats(functionId);
            return {
                tempDir: cacheResult.extractedPath,
                indexPath: path.join(cacheResult.extractedPath, 'index.js'),
                fromCache: true
            };
        }
        
        console.log(`Downloading package for function ${functionId}`);
        
        // Download and cache package with package_path from function_versions table
        const extractedPath = await cache.cachePackageFromPath(functionId, functionData.version, functionData.package_hash, functionData.file_size || 0, functionData.package_path);
        
        return {
            tempDir: extractedPath,
            indexPath: path.join(extractedPath, 'index.js'),
            fromCache: false
        };
        
    } catch (error) {
        console.error('Error getting function package:', error.message);
        if (error.message.includes('not found')) {
            throw new Error('Function not found');
        }
        throw new Error(`Failed to get function: ${error.message}`);
    }
}

/**
 * Fetch function metadata from database
 * @param {string} functionId - Function ID
 * @returns {Object} Function metadata
 */
async function fetchFunctionMetadata(functionId) {
    const query = `
        SELECT 
            f.id, 
            f.name, 
            f.is_active,
            f.created_at, 
            f.updated_at,
            fv.version,
            fv.package_path,
            fv.package_hash,
            fv.file_size
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        WHERE f.id = $1 AND f.is_active = true
    `;
    
    const result = await db.query(query, [functionId]);
    
    if (result.rows.length === 0) {
        throw new Error('Function not found');
    }
    
    return result.rows[0];
}

/**
 * Fetch environment variables for a function
 * @param {string} functionId - Function ID
 * @returns {Object} Environment variables as key-value pairs
 */
async function fetchEnvironmentVariables(functionId) {
    try {
        const result = await db.query(`
            SELECT variable_name, variable_value 
            FROM function_environment_variables 
            WHERE function_id = $1
        `, [functionId]);
        
        const envVars = {};
        result.rows.forEach(row => {
            envVars[row.variable_name] = row.variable_value;
        });
        
        return envVars;
    } catch (error) {
        console.error('Error fetching environment variables:', error);
        return {};
    }
}

/**
 * Create a secure console object that captures logs
 */
function createConsoleObject() {
    const logs = [];
    
    const formatArgs = (...args) => {
        return args.map(arg => {
            // Handle Error objects specially
            if (arg instanceof Error) {
                return arg.stack || arg.message || String(arg);
            }
            
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (error) {
                    // Handle circular references or other JSON.stringify errors
                    return '[object Object]';
                }
            }
            return String(arg);
        }).join(' ');
    };
    
    return {
        log: (...args) => logs.push({ level: 'log', message: formatArgs(...args), timestamp: Date.now() }),
        info: (...args) => logs.push({ level: 'info', message: formatArgs(...args), timestamp: Date.now() }),
        warn: (...args) => logs.push({ level: 'warn', message: formatArgs(...args), timestamp: Date.now() }),
        error: (...args) => logs.push({ level: 'error', message: formatArgs(...args), timestamp: Date.now() }),
        getLogs: () => logs
    };
}

/**
 * Create a mock request object compatible with Express.js
 */
function createRequestObject(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}) {
    const url = originalReq.url || '/';
    const protocol = originalReq.protocol || 'http';
    const hostname = originalReq.hostname || 'localhost';
    
    const request = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        protocol,
        hostname,
        secure: protocol === 'https',
        ip: originalReq.ip || originalReq.connection?.remoteAddress || '127.0.0.1',
        ips: originalReq.ips || [],
        body,
        query,
        params,
        headers,
        //cookies: {}, // Simplified cookies object
        
        // Express.js methods
        get(headerName) {
            return this.headers[headerName.toLowerCase()];
        },
        
        header(headerName) {
            return this.get(headerName);
        },
        
        is(type) {
            const contentType = this.get('content-type') || '';
            return contentType.includes(type);
        },
        
        accepts(types) {
            const acceptHeader = this.get('accept') || '*/*';
            if (typeof types === 'string') {
                return acceptHeader.includes(types) ? types : false;
            }
            if (Array.isArray(types)) {
                for (const type of types) {
                    if (acceptHeader.includes(type)) return type;
                }
                return false;
            }
            return acceptHeader;
        }
    };
    
    return request;
}

/**
 * Create a mock response object for function context
 */
function createResponseObject() {
    const response = {
        statusCode: 200,
        headers: {},
        data: undefined,
        locals: {},
        
        status(code) {
            this.statusCode = code;
            return this;
        },
        
        json(data) {
            this.data = data;
            this.headers['content-type'] = 'application/json';
            return this;
        },
        
        send(data) {
            this.data = data;
            if (!this.headers['content-type']) {
                if (typeof data === 'string') {
                    this.headers['content-type'] = 'text/plain';
                } else if (typeof data === 'object') {
                    this.headers['content-type'] = 'application/json';
                } else {
                    this.headers['content-type'] = 'text/plain';
                }
            }
            return this;
        },
        
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        
        get(name) {
            return this.headers[name.toLowerCase()];
        },
        
        end(data) {
            if (data !== undefined) {
                this.data = data;
            }
            return this;
        }
    };
    
    return response;
}

/**
 * Execute user function with proper context
 */
async function executeUserFunction(userFunction, context, packageDir) {
    return new Promise(async (resolve) => {
        let unhandledRejectionHandler = null;
        let isResolved = false;
        
        try {
            // Install per-execution unhandled rejection handler
            unhandledRejectionHandler = (reason, promise) => {
                if (!isResolved) {
                    const errorMessage = (reason instanceof Error ? reason.message : String(reason)) + 
                        (reason instanceof Error && reason.stack ? '\n' + sanitizeStackTrace(reason.stack, packageDir) : '');
                    isResolved = true;
                    resolve({
                        error: `Unhandled promise rejection: ${errorMessage}`,
                        statusCode: 500
                    });
                }
            };
            process.on('unhandledRejection', unhandledRejectionHandler);
            
            // Set timeout for execution
            const timeout = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve({
                        error: 'Function execution timeout (30s)',
                        statusCode: 504
                    });
                }
            }, 30000);

            // Wrap user function call in try-catch to catch synchronous errors
            let result;
            try {
                result = await userFunction(context.req, context.res);
            } catch (error) {
                clearTimeout(timeout);
                if (unhandledRejectionHandler) {
                    process.off('unhandledRejection', unhandledRejectionHandler);
                }
                const errorMessage = (error instanceof Error ? error.message : String(error)) + 
                    (error instanceof Error && error.stack ? '\n' + sanitizeStackTrace(error.stack, packageDir) : '');
                isResolved = true;
                resolve({ error: errorMessage, statusCode: 500 });
                return;
            }
            
            clearTimeout(timeout);
            
            // Check if the result is a promise (async function)
            if (result && typeof result.then === 'function') {
                try {
                    const promiseResult = await result;
                    
                    if (unhandledRejectionHandler) {
                        process.off('unhandledRejection', unhandledRejectionHandler);
                    }
                    
                    if (isResolved) return;
                    isResolved = true;
                    
                    if (context.res.data !== undefined) {
                        resolve({ 
                            data: context.res.data, 
                            statusCode: context.res.statusCode || 200 
                        });
                    } else if (promiseResult !== undefined) {
                        resolve({ data: promiseResult, statusCode: context.res.statusCode || 200 });
                    } else {
                        resolve({ 
                            error: 'Function did not produce any output', 
                            statusCode: 500
                        });
                    }
                } catch (error) {
                    if (unhandledRejectionHandler) {
                        process.off('unhandledRejection', unhandledRejectionHandler);
                    }
                    
                    if (isResolved) return;
                    isResolved = true;
                    
                    const errorMessage = (error instanceof Error ? error.message : String(error)) + 
                        (error instanceof Error && error.stack ? '\n' + sanitizeStackTrace(error.stack, packageDir) : '');
                    resolve({ error: errorMessage, statusCode: 500 });
                }
            }
            // For non-async functions
            else {
                if (unhandledRejectionHandler) {
                    process.off('unhandledRejection', unhandledRejectionHandler);
                }
                
                if (isResolved) return;
                isResolved = true;
                
                if (context.res.data !== undefined) {
                    resolve({ 
                        data: context.res.data, 
                        statusCode: context.res.statusCode || 200 
                    });
                } else if (result !== undefined) {
                    resolve({ data: result, statusCode: context.res.statusCode || 200 });
                } else {
                    resolve({ 
                        error: 'Function did not produce any output', 
                        statusCode: 500
                    });
                }
            }
            
        } catch (error) {
            if (unhandledRejectionHandler) {
                process.off('unhandledRejection', unhandledRejectionHandler);
            }
            
            if (isResolved) return;
            isResolved = true;
            
            const errorMessage = (error instanceof Error ? error.message : String(error)) + 
                (error instanceof Error && error.stack ? '\n' + sanitizeStackTrace(error.stack, packageDir) : '');
            resolve({
                error: errorMessage,
                statusCode: 500
            });
        }
    });
}

/**
 * Execute function in secure VM environment
 * @param {string} indexPath - Path to function's index.js
 * @param {Object} context - Execution context with req, res, console
 * @param {string} functionId - Function ID for environment variables
 * @returns {Object} Execution result
 */
async function executeFunction(indexPath, context, functionId) {
    // Get the package directory for local requires (outside try block so catch can access it)
    const packageDir = path.dirname(indexPath);
    
    try {
        // Fetch environment variables for this function
        const customEnvVars = await fetchEnvironmentVariables(functionId);
        
        // Read the function code
        const functionCode = await fs.readFile(indexPath, 'utf8');

        // Create a custom require function that supports local files
        const createCustomRequire = (currentDir, originalPackageDir) => {
            const allowedModules = [
                'crypto', 'querystring', 'url', 'util',
                'stream', 'events', 'buffer', 'string_decoder', 'zlib'
            ];
            
            return (moduleName) => {
                // Strip node: prefix if present
                let cleanModuleName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
                
                // Handle special virtualized modules
                if (cleanModuleName === 'fs') {
                    const fsProxy = createFsProxy(originalPackageDir);
                    fsProxy.promises = createFsPromisesProxy(originalPackageDir);
                    return fsProxy;
                }
                
                if (cleanModuleName === 'fs/promises') {
                    return createFsPromisesProxy(originalPackageDir);
                }
                
                if (cleanModuleName === 'path') {
                    return createPathProxy(originalPackageDir);
                }
                
                if (cleanModuleName === 'os') {
                    return createOsProxy();
                }
                
                // Handle local requires (starts with ./ or ../)
                if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                    try {
                        const fullPath = path.resolve(currentDir, moduleName);
                        
                        // Security check: ensure the required file is within the original package directory
                        const normalizedFullPath = path.normalize(fullPath);
                        const normalizedPackageDir = path.normalize(originalPackageDir);
                        
                        if (!normalizedFullPath.startsWith(normalizedPackageDir)) {
                            throw new Error(`Access denied: Cannot require files outside package directory`);
                        }
                        
                        // Try different file extensions
                        let filePath = fullPath;
                        if (!fs.existsSync(filePath)) {
                            if (fs.existsSync(`${fullPath}.js`)) {
                                filePath = `${fullPath}.js`;
                            } else if (fs.existsSync(path.join(fullPath, 'index.js'))) {
                                filePath = path.join(fullPath, 'index.js');
                            } else {
                                throw new Error(`Cannot find module '${moduleName}'`);
                            }
                        }
                        
                        // Read and execute the required file
                        const requiredCode = fs.readFileSync(filePath, 'utf8');
                        const virtualFilePath = realToVirtual(filePath, originalPackageDir);
                        const virtualDirPath = realToVirtual(path.dirname(filePath), originalPackageDir);
                        
                        const moduleContext = {
                            module: { exports: {} },
                            exports: {},
                            require: createCustomRequire(path.dirname(filePath), originalPackageDir),
                            __filename: virtualFilePath,
                            __dirname: virtualDirPath
                        };
                        
                        // Create VM for the required module
                        const moduleVM = new VM({
                            timeout: 5000,
                            sandbox: {
                                ...moduleContext,
                                console: context.console,
                                Buffer,
                                Error: createErrorConstructor(originalPackageDir),
                                TypeError: createErrorConstructor(originalPackageDir),
                                ReferenceError: createErrorConstructor(originalPackageDir),
                                SyntaxError: createErrorConstructor(originalPackageDir),
                                RangeError: createErrorConstructor(originalPackageDir),
                                URIError: createErrorConstructor(originalPackageDir),
                                EvalError: createErrorConstructor(originalPackageDir),
                                setTimeout,
                                setInterval,
                                clearTimeout,
                                clearInterval,
                                process: {
                                    env: customEnvVars
                                }
                            }
                        });
                        
                        moduleVM.run(requiredCode);
                        return moduleContext.module.exports || moduleContext.exports;
                        
                    } catch (error) {
                        throw new Error(`Error requiring '${moduleName}': ${error.message}`);
                    }
                }
                
                // Handle built-in Node.js modules
                if (allowedModules.includes(moduleName)) {
                    return require(moduleName);
                }
                
                throw new Error(`Module '${moduleName}' is not allowed in sandbox environment`);
            };
        };

        // Create a secure VM
        const vm = new VM({
            timeout: 30000, // 30 second timeout
            sandbox: {
                require: createCustomRequire(packageDir, packageDir),
                console: context.console,
                Buffer,
                Error: createErrorConstructor(packageDir),
                TypeError: createErrorConstructor(packageDir),
                ReferenceError: createErrorConstructor(packageDir),
                SyntaxError: createErrorConstructor(packageDir),
                RangeError: createErrorConstructor(packageDir),
                URIError: createErrorConstructor(packageDir),
                EvalError: createErrorConstructor(packageDir),
                fetch: createSecureFetchProxy(packageDir),
                process: {
                    env: customEnvVars
                },
                setTimeout,
                setInterval,
                clearTimeout,
                clearInterval,
                module: { exports: {} },
                exports: {},
                __filename: realToVirtual(indexPath, packageDir),
                __dirname: realToVirtual(packageDir, packageDir)
            }
        });

        // Wrap the function code to handle different export patterns
        const wrappedCode = `
            (function() {
                ${functionCode}
                
                // Handle different export patterns
                let exportedFunction;
                if (typeof module !== 'undefined' && module.exports) {
                    exportedFunction = module.exports;
                } else if (typeof exports !== 'undefined') {
                    exportedFunction = exports.handler || exports.default || exports;
                }
                
                if (typeof exportedFunction === 'function') {
                    return exportedFunction;
                } else {
                    throw new Error('Function must export a function');
                }
            })();
        `;

        // Execute the code and get the function
        const userFunction = vm.run(wrappedCode);

        // Execute the user function with additional error boundary
        let result;
        try {
            result = await executeUserFunction(userFunction, context, packageDir);
            // Add a small delay to allow any pending promises to settle
            await new Promise(resolve => setImmediate(resolve));
        } catch (executionError) {
            const errorMessage = (executionError instanceof Error ? executionError.message : String(executionError)) + 
                (executionError instanceof Error && executionError.stack ? '\n' + sanitizeStackTrace(executionError.stack, packageDir) : '');
            result = {
                error: errorMessage,
                statusCode: 500
            };
        }
        
        return result;

    } catch (error) {
        const errorMessage = error.message + (error.stack ? '\n' + sanitizeStackTrace(error.stack, packageDir) : '');
        return {
            error: errorMessage,
            statusCode: 500
        };
    }
}

/**
 * Create execution context for function execution
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {Object} query - Query parameters  
 * @param {Object} headers - Request headers
 * @param {Object} params - Route parameters
 * @param {Object} originalReq - Original request object
 * @returns {Object} Execution context with req, res, console
 */
function createExecutionContext(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}) {
    return {
        req: createRequestObject(method, body, query, headers, params, originalReq),
        res: createResponseObject(),
        console: createConsoleObject()
    };
}

module.exports = {
    executeFunction,
    createExecutionContext,
    fetchEnvironmentVariables,
    createConsoleObject,
    createRequestObject,
    createResponseObject,
    getFunctionPackage,
    fetchFunctionMetadata
};
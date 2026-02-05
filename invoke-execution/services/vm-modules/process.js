const throwEACCES = (method) => {
    const err = new Error(`${method}: operation not permitted`);
    err.code = 'EACCES';
    err.errno = -13;
    err.syscall = method;
    throw err;
};

const startTime = Date.now();

const process = {
    // Environment variables (read-only in sandbox)
    env: _envVars,
    
    // Process info
    pid: 1,
    ppid: 1,
    platform: 'linux',
    arch: _arch,
    
    // Node.js version info
    version: _node_version,
    versions: _node_versions,
    
    // Command line arguments (mocked)
    argv: ['node', 'index.js'],
    argv0: 'node',
    execPath: '/usr/local/bin/node',
    execArgv: [],
    
    // Working directory (read-only)
    cwd: () => '/app',
    
    // Memory usage (mocked)
    memoryUsage: () => ({
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0
    }),
    
    // Resource usage (mocked)
    resourceUsage: () => ({
        userCPUTime: 0,
        systemCPUTime: 0,
        maxRSS: 0,
        sharedMemorySize: 0,
        unsharedDataSize: 0,
        unsharedStackSize: 0,
        minorPageFault: 0,
        majorPageFault: 0,
        swappedOut: 0,
        fsRead: 0,
        fsWrite: 0,
        ipcSent: 0,
        ipcReceived: 0,
        signalsCount: 0,
        voluntaryContextSwitches: 0,
        involuntaryContextSwitches: 0
    }),
    
    // Uptime
    uptime: () => (Date.now() - startTime) / 1000,
    
    // High resolution time
    hrtime: function(previousTimestamp) {
        const now = process.hrtime.bigint();
        if (previousTimestamp) {
            const prev = BigInt(previousTimestamp[0]) * 1000000000n + BigInt(previousTimestamp[1]);
            const diff = now - prev;
            return [Number(diff / 1000000000n), Number(diff % 1000000000n)];
        }
        return [Number(now / 1000000000n), Number(now % 1000000000n)];
    },
    
    // High resolution time as bigint
    get hrtime() {
        const fn = function(previousTimestamp) {
            const now = process.hrtime.bigint();
            if (previousTimestamp) {
                const prev = BigInt(previousTimestamp[0]) * 1000000000n + BigInt(previousTimestamp[1]);
                const diff = now - prev;
                return [Number(diff / 1000000000n), Number(diff % 1000000000n)];
            }
            return [Number(now / 1000000000n), Number(now % 1000000000n)];
        };
        fn.bigint = () => {
            const [sec, nsec] = globalThis.__performance_now ? 
                [Math.floor(globalThis.__performance_now() / 1000), (globalThis.__performance_now() % 1000) * 1000000] :
                [Math.floor(Date.now() / 1000), (Date.now() % 1000) * 1000000];
            return BigInt(sec) * 1000000000n + BigInt(nsec);
        };
        return fn;
    },
    
    // Next tick (basic implementation)
    nextTick: (callback, ...args) => {
        Promise.resolve().then(() => callback(...args));
    },
    
    // Exit code (readable but exit() throws)
    exitCode: undefined,
    
    // Title (read-only)
    get title() {
        return 'invoke sandbox';
    },
    set title(val) {
        // Silently ignore
    },
    
    // Feature flags
    features: {
        inspector: false,
        debug: false,
        uv: true,
        ipv6: true,
        tls_alpn: true,
        tls_sni: true,
        tls_ocsp: true,
        tls: true
    },
    
    // Config (empty object)
    config: {},
    
    // Release info
    release: {},
    
    // ============================================
    // NON-READONLY METHODS (throw EACCES)
    // ============================================
    
    exit: (code) => throwEACCES('exit'),
    abort: () => throwEACCES('abort'),
    kill: (pid, signal) => throwEACCES('kill'),
    chdir: (directory) => throwEACCES('chdir'),
    
    // User/group operations
    setuid: (id) => throwEACCES('setuid'),
    setgid: (id) => throwEACCES('setgid'),
    seteuid: (id) => throwEACCES('seteuid'),
    setegid: (id) => throwEACCES('setegid'),
    setgroups: (groups) => throwEACCES('setgroups'),
    initgroups: (user, extraGroup) => throwEACCES('initgroups'),
    
    // Priority operations
    getuid: () => 1000,
    getgid: () => 1000,
    geteuid: () => 1000,
    getegid: () => 1000,
    getgroups: () => [1000],
    
    // Umask (throws on set)
    umask: (mask) => {
        if (mask !== undefined) {
            throwEACCES('umask');
        }
        return 0;
    },
    
    // DLOpen not allowed
    dlopen: () => throwEACCES('dlopen'),
    
    // Send (not allowed)
    send: () => throwEACCES('send'),
    disconnect: () => throwEACCES('disconnect'),
    
    // Connected flag
    connected: false,
    
    // Channel (not available)
    channel: undefined,
    
    // Emit warning (allowed but no-op)
    emitWarning: (warning, options) => {
        // No-op in sandbox
    },
    
    // Binding (not allowed)
    binding: (name) => {
        const err = new Error('No such module: ' + name);
        err.code = 'ERR_UNKNOWN_BUILTIN_MODULE';
        throw err;
    },
    
    _linkedBinding: (name) => {
        const err = new Error('No such module: ' + name);
        err.code = 'ERR_UNKNOWN_BUILTIN_MODULE';
        throw err;
    },
    
    // Debug port
    debugPort: 0,
    
    // Allow read of cpuUsage but return mock data
    cpuUsage: (previousValue) => {
        const user = 0;
        const system = 0;
        
        if (previousValue) {
            return {
                user: user - previousValue.user,
                system: system - previousValue.system
            };
        }
        
        return { user, system };
    },
    
    // Assert (read-only check)
    assert: (value, message) => {
        if (!value) {
            throw new Error(message || 'Assertion failed');
        }
    },
    
    // Allowed warning events (no-op)
    on: (event, listener) => {
        // No-op - no actual event emitter in sandbox
        return process;
    },
    once: (event, listener) => {
        // No-op
        return process;
    },
    off: (event, listener) => {
        // No-op
        return process;
    },
    removeListener: (event, listener) => {
        // No-op
        return process;
    },
    removeAllListeners: (event) => {
        // No-op
        return process;
    },
    emit: (event, ...args) => {
        // No-op
        return false;
    },
    listeners: (event) => {
        return [];
    },
    listenerCount: (event) => {
        return 0;
    },
    
    // Domain (deprecated)
    domain: null,
    _exiting: false,
    
    // Allow reallyExit but make it throw
    _exit: (code) => throwEACCES('_exit'),
    reallyExit: (code) => throwEACCES('reallyExit')
};

module.exports = process;

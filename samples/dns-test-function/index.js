const dns = require('dns');

module.exports = async function(req, res) {
    const results = {
        lookupTests: {},
        lookupServiceTests: {},
        resolveTests: {},
        reverseTests: {},
        promisesTests: {},
        resolverTests: {},
        serverTests: {},
        errors: []
    };

    try {
        // Test dns.lookup (callback)
        await new Promise((resolve) => {
            dns.lookup('example.com', (err, address, family) => {
                if (err) {
                    results.errors.push({ test: 'dns.lookup', error: err.message, code: err.code });
                } else {
                    results.lookupTests.exampleCom = { address, family };
                }
                resolve();
            });
        });

        // Test dns.lookup with options
        await new Promise((resolve) => {
            dns.lookup('localhost', { family: 4 }, (err, address, family) => {
                if (err) {
                    results.errors.push({ test: 'dns.lookup localhost', error: err.message, code: err.code });
                } else {
                    results.lookupTests.localhost = { address, family };
                }
                resolve();
            });
        });

        // Test dns.lookupService
        await new Promise((resolve) => {
            dns.lookupService('127.0.0.1', 80, (err, hostname, service) => {
                if (err) {
                    results.errors.push({ test: 'dns.lookupService', error: err.message, code: err.code });
                } else {
                    results.lookupServiceTests.localhost80 = { hostname, service };
                }
                resolve();
            });
        });

        // Test dns.resolve4
        await new Promise((resolve) => {
            dns.resolve4('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolve4', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolve4 = addresses;
                }
                resolve();
            });
        });

        // Test dns.resolve6
        await new Promise((resolve) => {
            dns.resolve6('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolve6', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolve6 = addresses;
                }
                resolve();
            });
        });

        // Test dns.resolveMx
        await new Promise((resolve) => {
            dns.resolveMx('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolveMx', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolveMx = addresses;
                }
                resolve();
            });
        });

        // Test dns.resolveTxt
        await new Promise((resolve) => {
            dns.resolveTxt('example.com', (err, records) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolveTxt', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolveTxt = records;
                }
                resolve();
            });
        });

        // Test dns.resolveNs
        await new Promise((resolve) => {
            dns.resolveNs('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolveNs', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolveNs = addresses;
                }
                resolve();
            });
        });

        // Test dns.resolveCname
        await new Promise((resolve) => {
            dns.resolveCname('www.example.com', (err, addresses) => {
                if (err) {
                    // CNAME may not exist, that's ok
                    results.resolveTests.resolveCname = { error: err.code };
                } else {
                    results.resolveTests.resolveCname = addresses;
                }
                resolve();
            });
        });

        // Test dns.resolveSoa
        await new Promise((resolve) => {
            dns.resolveSoa('example.com', (err, address) => {
                if (err) {
                    results.errors.push({ test: 'dns.resolveSoa', error: err.message, code: err.code });
                } else {
                    results.resolveTests.resolveSoa = address;
                }
                resolve();
            });
        });

        // Test dns.reverse
        await new Promise((resolve) => {
            dns.reverse('8.8.8.8', (err, hostnames) => {
                if (err) {
                    results.errors.push({ test: 'dns.reverse', error: err.message, code: err.code });
                } else {
                    results.reverseTests.googleDNS = hostnames;
                }
                resolve();
            });
        });

        // Test dns.promises API
        try {
            const lookupResult = await dns.promises.lookup('example.com');
            results.promisesTests.lookup = lookupResult;
        } catch (err) {
            results.errors.push({ test: 'dns.promises.lookup', error: err.message, code: err.code });
        }

        try {
            const resolve4Result = await dns.promises.resolve4('example.com');
            results.promisesTests.resolve4 = resolve4Result;
        } catch (err) {
            results.errors.push({ test: 'dns.promises.resolve4', error: err.message, code: err.code });
        }

        try {
            const resolve6Result = await dns.promises.resolve6('example.com');
            results.promisesTests.resolve6 = resolve6Result;
        } catch (err) {
            results.errors.push({ test: 'dns.promises.resolve6', error: err.message, code: err.code });
        }

        try {
            const resolveMxResult = await dns.promises.resolveMx('example.com');
            results.promisesTests.resolveMx = resolveMxResult;
        } catch (err) {
            results.errors.push({ test: 'dns.promises.resolveMx', error: err.message, code: err.code });
        }

        // Test dns.Resolver class
        const resolver = new dns.Resolver();
        
        // Get default servers
        const servers = resolver.getServers();
        results.resolverTests.defaultServers = servers;

        // Set custom servers
        resolver.setServers(['8.8.8.8', '8.8.4.4']);
        results.resolverTests.customServers = resolver.getServers();

        // Test resolver.resolve4
        await new Promise((resolve) => {
            resolver.resolve4('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'resolver.resolve4', error: err.message, code: err.code });
                } else {
                    results.resolverTests.resolve4 = addresses;
                }
                resolve();
            });
        });

        // Test resolver.resolveMx
        await new Promise((resolve) => {
            resolver.resolveMx('example.com', (err, addresses) => {
                if (err) {
                    results.errors.push({ test: 'resolver.resolveMx', error: err.message, code: err.code });
                } else {
                    results.resolverTests.resolveMx = addresses;
                }
                resolve();
            });
        });

        // Test dns.promises.Resolver
        const promisesResolver = new dns.promises.Resolver();
        promisesResolver.setServers(['1.1.1.1', '1.0.0.1']);
        results.resolverTests.promisesResolverServers = promisesResolver.getServers();

        try {
            const resolverResult = await promisesResolver.resolve4('example.com');
            results.resolverTests.promisesResolverResult = resolverResult;
        } catch (err) {
            results.errors.push({ test: 'promisesResolver.resolve4', error: err.message, code: err.code });
        }

        // Test server configuration
        const originalServers = dns.getServers();
        results.serverTests.originalServers = originalServers;

        dns.setServers(['8.8.8.8', '1.1.1.1']);
        results.serverTests.modifiedServers = dns.getServers();

        // Restore original servers
        dns.setServers(originalServers);
        results.serverTests.restoredServers = dns.getServers();

        // Test getDefaultResultOrder (Node.js v16+)
        if (dns.getDefaultResultOrder) {
            results.serverTests.defaultResultOrder = dns.getDefaultResultOrder();
        }

        // Test error codes constants
        results.errorCodes = {
            NODATA: dns.NODATA,
            FORMERR: dns.FORMERR,
            SERVFAIL: dns.SERVFAIL,
            NOTFOUND: dns.NOTFOUND,
            NOTIMP: dns.NOTIMP,
            REFUSED: dns.REFUSED,
            BADQUERY: dns.BADQUERY,
            BADNAME: dns.BADNAME,
            BADFAMILY: dns.BADFAMILY,
            BADRESP: dns.BADRESP,
            CONNREFUSED: dns.CONNREFUSED,
            TIMEOUT: dns.TIMEOUT,
            EOF: dns.EOF,
            FILE: dns.FILE,
            NOMEM: dns.NOMEM,
            DESTRUCTION: dns.DESTRUCTION,
            BADSTR: dns.BADSTR,
            BADFLAGS: dns.BADFLAGS,
            NONAME: dns.NONAME,
            BADHINTS: dns.BADHINTS,
            NOTINITIALIZED: dns.NOTINITIALIZED,
            LOADIPHLPAPI: dns.LOADIPHLPAPI,
            ADDRGETNETWORKPARAMS: dns.ADDRGETNETWORKPARAMS,
            CANCELLED: dns.CANCELLED
        };

        results.success = true;
        results.message = 'DNS module tests completed';

    } catch (error) {
        results.success = false;
        results.errors.push({
            test: 'general',
            error: error.message,
            stack: error.stack
        });
    }

    res.json(results);
};

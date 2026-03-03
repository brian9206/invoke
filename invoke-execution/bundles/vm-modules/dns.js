const dns = {};
module.exports = dns;

// DNS error codes
dns.NODATA = 'ENODATA';
dns.FORMERR = 'EFORMERR';
dns.SERVFAIL = 'ESERVFAIL';
dns.NOTFOUND = 'ENOTFOUND';
dns.NOTIMP = 'ENOTIMP';
dns.REFUSED = 'EREFUSED';
dns.BADQUERY = 'EBADQUERY';
dns.BADNAME = 'EBADNAME';
dns.BADFAMILY = 'EBADFAMILY';
dns.BADRESP = 'EBADRESP';
dns.CONNREFUSED = 'ECONNREFUSED';
dns.TIMEOUT = 'ETIMEOUT';
dns.EOF = 'EOF';
dns.FILE = 'EFILE';
dns.NOMEM = 'ENOMEM';
dns.DESTRUCTION = 'EDESTRUCTION';
dns.BADSTR = 'EBADSTR';
dns.BADFLAGS = 'EBADFLAGS';
dns.NONAME = 'ENONAME';
dns.BADHINTS = 'EBADHINTS';
dns.NOTINITIALIZED = 'ENOTINITIALIZED';
dns.LOADIPHLPAPI = 'ELOADIPHLPAPI';
dns.ADDRGETNETWORKPARAMS = 'EADDRGETNETWORKPARAMS';
dns.CANCELLED = 'ECANCELLED';

// Helper function to convert error objects from host
function convertErrorObject(err) {
    if (!err) return null;
    if (err instanceof Error) return err;
    
    if (err && typeof err === 'object' && err.message) {
        const error = new Error(err.message);
        if (err.code) error.code = err.code;
        if (err.errno) error.errno = err.errno;
        if (err.syscall) error.syscall = err.syscall;
        if (err.hostname) error.hostname = err.hostname;
        return error;
    }
    
    return err;
}

// Helper to normalize options
function normalizeOptions(options, family) {
    if (typeof options === 'number') {
        return { family: options };
    } else if (typeof options === 'string') {
        return { family: family || 0 };
    } else if (options && typeof options === 'object') {
        return options;
    }
    return {};
}

// dns.lookup(hostname[, options], callback)
dns.lookup = function(hostname, options, callback) {
    // Handle overloads: lookup(hostname, callback), lookup(hostname, options, callback)
    let actualOptions = {};
    let actualCallback = callback;

    if (typeof options === 'function') {
        actualCallback = options;
        actualOptions = { family: 0 };
    } else {
        actualOptions = normalizeOptions(options);
    }

    if (typeof actualCallback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    // Wrap callback with ivm.Reference
    const wrappedCallback = new ivm.Reference((err, address, family) => {
        if (err) {
            actualCallback(convertErrorObject(err));
        } else {
            actualCallback(null, address, family);
        }
    });

    _dns_lookup.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
};

// dns.lookupService(address, port, callback)
dns.lookupService = function(address, port, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, hostname, service) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, hostname, service);
        }
    });

    _dns_lookupService.applySync(undefined, [address, port, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolve(hostname[, rrtype], callback)
dns.resolve = function(hostname, rrtype, callback) {
    // Handle overloads: resolve(hostname, callback), resolve(hostname, rrtype, callback)
    let actualRrtype = 'A';
    let actualCallback = callback;

    if (typeof rrtype === 'function') {
        actualCallback = rrtype;
        actualRrtype = 'A';
    } else if (typeof rrtype === 'string') {
        actualRrtype = rrtype;
    }

    if (typeof actualCallback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            actualCallback(convertErrorObject(err));
        } else {
            actualCallback(null, addresses);
        }
    });

    _dns_resolve.applySync(undefined, [hostname, actualRrtype, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolve4(hostname[, options], callback)
dns.resolve4 = function(hostname, options, callback) {
    let actualOptions = {};
    let actualCallback = callback;

    if (typeof options === 'function') {
        actualCallback = options;
        actualOptions = {};
    } else if (typeof options === 'object') {
        actualOptions = options;
    }

    if (typeof actualCallback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            actualCallback(convertErrorObject(err));
        } else {
            actualCallback(null, addresses);
        }
    });

    _dns_resolve4.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolve6(hostname[, options], callback)
dns.resolve6 = function(hostname, options, callback) {
    let actualOptions = {};
    let actualCallback = callback;

    if (typeof options === 'function') {
        actualCallback = options;
        actualOptions = {};
    } else if (typeof options === 'object') {
        actualOptions = options;
    }

    if (typeof actualCallback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            actualCallback(convertErrorObject(err));
        } else {
            actualCallback(null, addresses);
        }
    });

    _dns_resolve6.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveAny(hostname, callback)
dns.resolveAny = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, records) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, records);
        }
    });

    _dns_resolveAny.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveCname(hostname, callback)
dns.resolveCname = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveCname.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveMx(hostname, callback)
dns.resolveMx = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveMx.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveNaptr(hostname, callback)
dns.resolveNaptr = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveNaptr.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveNs(hostname, callback)
dns.resolveNs = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveNs.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolvePtr(hostname, callback)
dns.resolvePtr = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolvePtr.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveSoa(hostname, callback)
dns.resolveSoa = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, address) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, address);
        }
    });

    _dns_resolveSoa.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveSrv(hostname, callback)
dns.resolveSrv = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveSrv.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.resolveTxt(hostname, callback)
dns.resolveTxt = function(hostname, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, addresses) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, addresses);
        }
    });

    _dns_resolveTxt.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
};

// dns.reverse(ip, callback)
dns.reverse = function(ip, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
    }

    const wrappedCallback = new ivm.Reference((err, hostnames) => {
        if (err) {
            callback(convertErrorObject(err));
        } else {
            callback(null, hostnames);
        }
    });

    _dns_reverse.applySync(undefined, [ip, wrappedCallback], { arguments: { copy: true } });
};

// dns.setDefaultResultOrder(order)
dns.setDefaultResultOrder = function(order) {
    _dns_setDefaultResultOrder.applySync(undefined, [order], { arguments: { copy: true } });
};

// dns.getDefaultResultOrder()
dns.getDefaultResultOrder = function() {
    return _dns_getDefaultResultOrder.applySync(undefined, [], { arguments: { copy: true } });
};

// dns.setServers(servers)
dns.setServers = function(servers) {
    const serversCopy = new ivm.ExternalCopy(servers).copyInto({ release: true });
    _dns_setServers.applySync(undefined, [serversCopy]);
};

// dns.getServers()
dns.getServers = function() {
    return _dns_getServers.applySync(undefined, [], { arguments: { copy: true } });
};

// Resolver class
class Resolver {
    constructor(options) {
        this._handle = _dns_createResolver.applySync(undefined, [options || {}], { arguments: { copy: true } });
    }

    cancel() {
        _dns_resolverCancel.applySync(undefined, [this._handle], { arguments: { copy: true } });
    }

    setServers(servers) {
        const serversCopy = new ivm.ExternalCopy(servers).copyInto({ release: true });
        _dns_resolverSetServers.applySync(undefined, [this._handle, serversCopy]);
    }

    getServers() {
        return _dns_resolverGetServers.applySync(undefined, [this._handle], { arguments: { copy: true } });
    }

    resolve(hostname, rrtype, callback) {
        let actualRrtype = 'A';
        let actualCallback = callback;

        if (typeof rrtype === 'function') {
            actualCallback = rrtype;
            actualRrtype = 'A';
        } else if (typeof rrtype === 'string') {
            actualRrtype = rrtype;
        }

        if (typeof actualCallback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                actualCallback(convertErrorObject(err));
            } else {
                actualCallback(null, addresses);
            }
        });

        _dns_resolverResolve.applySync(undefined, [this._handle, hostname, actualRrtype, wrappedCallback], { arguments: { copy: true } });
    }

    resolve4(hostname, options, callback) {
        let actualOptions = {};
        let actualCallback = callback;

        if (typeof options === 'function') {
            actualCallback = options;
            actualOptions = {};
        } else if (typeof options === 'object') {
            actualOptions = options;
        }

        if (typeof actualCallback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                actualCallback(convertErrorObject(err));
            } else {
                actualCallback(null, addresses);
            }
        });

        _dns_resolverResolve4.applySync(undefined, [this._handle, hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
    }

    resolve6(hostname, options, callback) {
        let actualOptions = {};
        let actualCallback = callback;

        if (typeof options === 'function') {
            actualCallback = options;
            actualOptions = {};
        } else if (typeof options === 'object') {
            actualOptions = options;
        }

        if (typeof actualCallback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                actualCallback(convertErrorObject(err));
            } else {
                actualCallback(null, addresses);
            }
        });

        _dns_resolverResolve6.applySync(undefined, [this._handle, hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
    }

    resolveAny(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, records) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, records);
            }
        });

        _dns_resolverResolveAny.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveCname(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveCname.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveMx(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveMx.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveNaptr(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveNaptr.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveNs(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveNs.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolvePtr(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolvePtr.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveSoa(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, address) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, address);
            }
        });

        _dns_resolverResolveSoa.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveSrv(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveSrv.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    resolveTxt(hostname, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, addresses);
            }
        });

        _dns_resolverResolveTxt.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
    }

    reverse(ip, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        const wrappedCallback = new ivm.Reference((err, hostnames) => {
            if (err) {
                callback(convertErrorObject(err));
            } else {
                callback(null, hostnames);
            }
        });

        _dns_resolverReverse.applySync(undefined, [this._handle, ip, wrappedCallback], { arguments: { copy: true } });
    }
}

dns.Resolver = Resolver;

// dns.promises API
const promises = {};

promises.lookup = function(hostname, options) {
    const actualOptions = normalizeOptions(options);
    
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, address, family) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve({ address, family });
            }
        });

        _dns_lookup.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.lookupService = function(address, port) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, hostname, service) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve({ hostname, service });
            }
        });

        _dns_lookupService.applySync(undefined, [address, port, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolve = function(hostname, rrtype) {
    const actualRrtype = rrtype || 'A';
    
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolve.applySync(undefined, [hostname, actualRrtype, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolve4 = function(hostname, options) {
    const actualOptions = options || {};
    
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolve4.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolve6 = function(hostname, options) {
    const actualOptions = options || {};
    
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolve6.applySync(undefined, [hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveAny = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, records) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(records);
            }
        });

        _dns_resolveAny.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveCname = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveCname.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveMx = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveMx.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveNaptr = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveNaptr.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveNs = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveNs.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolvePtr = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolvePtr.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveSoa = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, address) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(address);
            }
        });

        _dns_resolveSoa.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveSrv = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveSrv.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.resolveTxt = function(hostname) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, addresses) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(addresses);
            }
        });

        _dns_resolveTxt.applySync(undefined, [hostname, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.reverse = function(ip) {
    return new Promise((resolve, reject) => {
        const wrappedCallback = new ivm.Reference((err, hostnames) => {
            if (err) {
                reject(convertErrorObject(err));
            } else {
                resolve(hostnames);
            }
        });

        _dns_reverse.applySync(undefined, [ip, wrappedCallback], { arguments: { copy: true } });
    });
};

promises.setDefaultResultOrder = function(order) {
    _dns_setDefaultResultOrder.applySync(undefined, [order], { arguments: { copy: true } });
};

promises.getDefaultResultOrder = function() {
    return _dns_getDefaultResultOrder.applySync(undefined, [], { arguments: { copy: true } });
};

promises.setServers = function(servers) {
    const serversCopy = new ivm.ExternalCopy(servers).copyInto({ release: true });
    _dns_setServers.applySync(undefined, [serversCopy]);
};

promises.getServers = function() {
    return _dns_getServers.applySync(undefined, [], { arguments: { copy: true } });
};

// Resolver class for promises API
class PromisesResolver {
    constructor(options) {
        this._handle = _dns_createResolver.applySync(undefined, [options || {}], { arguments: { copy: true } });
    }

    cancel() {
        _dns_resolverCancel.applySync(undefined, [this._handle], { arguments: { copy: true } });
    }

    setServers(servers) {
        const serversCopy = new ivm.ExternalCopy(servers).copyInto({ release: true });
        _dns_resolverSetServers.applySync(undefined, [this._handle, serversCopy]);
    }

    getServers() {
        return _dns_resolverGetServers.applySync(undefined, [this._handle], { arguments: { copy: true } });
    }

    resolve(hostname, rrtype) {
        const actualRrtype = rrtype || 'A';
        
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolve.applySync(undefined, [this._handle, hostname, actualRrtype, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolve4(hostname, options) {
        const actualOptions = options || {};
        
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolve4.applySync(undefined, [this._handle, hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolve6(hostname, options) {
        const actualOptions = options || {};
        
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolve6.applySync(undefined, [this._handle, hostname, actualOptions, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveAny(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, records) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(records);
                }
            });

            _dns_resolverResolveAny.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveCname(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveCname.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveMx(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveMx.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveNaptr(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveNaptr.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveNs(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveNs.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolvePtr(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolvePtr.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveSoa(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, address) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(address);
                }
            });

            _dns_resolverResolveSoa.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveSrv(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveSrv.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    resolveTxt(hostname) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, addresses) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(addresses);
                }
            });

            _dns_resolverResolveTxt.applySync(undefined, [this._handle, hostname, wrappedCallback], { arguments: { copy: true } });
        });
    }

    reverse(ip) {
        return new Promise((resolve, reject) => {
            const wrappedCallback = new ivm.Reference((err, hostnames) => {
                if (err) {
                    reject(convertErrorObject(err));
                } else {
                    resolve(hostnames);
                }
            });

            _dns_resolverReverse.applySync(undefined, [this._handle, ip, wrappedCallback], { arguments: { copy: true } });
        });
    }
}

promises.Resolver = PromisesResolver;

dns.promises = promises;
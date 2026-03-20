'use strict';

/**
 * Lightweight Express.js-compatible Router for the invoke-execution VM sandbox.
 *
 * Usage inside a user function:
 *
 *   const router = new Router();
 *
 *   router.get('/', (req, res) => res.json({ hello: 'world' }));
 *   router.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
 *   router.use((req, res) => res.status(404).send('Not Found'));
 *
 *   module.exports = router;
 *
 * The Router constructor returns a callable function so that
 * `typeof new Router() === 'function'`, which satisfies the execution
 * engine's export check without any engine modifications.
 */

const { match } = require('path-to-regexp');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'options', 'head'];

/** Match-all function used by use() with no path. */
function matchAll() {
    return { path: '/', params: {} };
}

/**
 * Build a match function for the given path.
 * @param {string|null} path
 * @param {boolean} prefix - true for use() (prefix match), false for route methods (exact match)
 */
function buildMatchFn(path, prefix) {
    if (path === null || path === undefined) return matchAll;
    path = path === '' ? '/' : path;
    return match(path, { decode: decodeURIComponent, end: !prefix });
}

/**
 * Router constructor.
 *
 * Returns the dispatch function itself with Router methods attached via the
 * prototype chain, so that both `typeof router === 'function'` and
 * `router.get(...)` work correctly.
 */
function Router() {
    const router = function(req, res) {
        return router._dispatch(req, res);
    };
    Object.setPrototypeOf(router, Router.prototype);
    router._stack = [];
    return router;
}

/**
 * Internal: add a layer to the stack.
 * @param {string|null} method - HTTP method in uppercase, 'ALL', or null (any method, use())
 * @param {string|null} path
 * @param {Function[]} handlers
 * @param {boolean} prefix - whether to use prefix matching
 */
Router.prototype._add = function(method, path, handlers, prefix) {
    const matchFn = buildMatchFn(path, prefix);
    const flat = [].concat.apply([], handlers); // flatten one level (allow array of handlers)
    for (const handler of flat) {
        if (typeof handler !== 'function') {
            throw new TypeError('Router handlers must be functions, got ' + typeof handler);
        }
        this._stack.push({ method, matchFn, handler });
    }
    return this;
};

/**
 * Dispatch an incoming request through the route stack.
 * Returns a Promise that resolves once a response has been sent or a 404 is issued.
 */
Router.prototype._dispatch = function(req, res) {
    const self = this;
    return new Promise(function(resolve) {
        const stack = self._stack;
        let idx = 0;
        const path = req.path || (req.url ? req.url.split('?')[0] : '/') || '/';
        const method = (req.method || 'GET').toUpperCase();

        function done(err) {
            if (err && !res.headersSent) {
                const msg = err instanceof Error ? err.message : String(err);
                res.status(500).send(msg);
            } else if (!res.headersSent) {
                res.status(404).send('Cannot ' + method + ' ' + path);
            }
            resolve();
        }

        function next(err) {
            if (err) { done(err); return; }

            while (idx < stack.length) {
                const layer = stack[idx++];

                // Skip if wrong HTTP method
                if (layer.method !== null && layer.method !== 'ALL' && layer.method !== method) {
                    continue;
                }

                // Match path
                let matched;
                try {
                    matched = layer.matchFn(path);
                } catch (e) {
                    done(e);
                    return;
                }
                if (!matched) continue;

                // Matched — call handler
                const prevParams = req.params;
                req.params = Object.assign({}, req.params, matched.params);

                let called = false;
                const callNext = function(e) {
                    if (called) return;
                    called = true;
                    req.params = prevParams;
                    next(e);
                };

                let result;
                try {
                    result = layer.handler(req, res, callNext);
                } catch (e) {
                    req.params = prevParams;
                    done(e);
                    return;
                }

                if (result && typeof result.then === 'function') {
                    // Async handler: wait for it to complete
                    result.then(
                        function() { if (!called) resolve(); },
                        function(e) { if (!called) { req.params = prevParams; done(e); } }
                    );
                } else if (!called) {
                    // Sync handler that didn't call next() — response was sent
                    resolve();
                }
                return; // Yield until next() or the promise above
            }

            done(); // No more layers → 404
        }

        next();
    });
};

/**
 * Register middleware, with an optional path prefix.
 *   router.use(fn)
 *   router.use('/prefix', fn)
 *   router.use('/prefix', fn1, fn2)
 */
Router.prototype.use = function(path) {
    let handlers, routePath;
    if (typeof path === 'function') {
        routePath = null; // match all paths
        handlers = Array.prototype.slice.call(arguments);
    } else if (typeof path === 'string') {
        routePath = path;
        handlers = Array.prototype.slice.call(arguments, 1);
    } else {
        routePath = null;
        handlers = Array.prototype.slice.call(arguments);
    }
    return this._add(null, routePath, handlers, true);
};

/** Register a handler for all HTTP methods on the given path. */
Router.prototype.all = function(path) {
    return this._add('ALL', path, Array.prototype.slice.call(arguments, 1), false);
};

// Register .get(), .post(), .put(), .patch(), .options(), .head()
HTTP_METHODS.forEach(function(m) {
    Router.prototype[m] = function(path) {
        return this._add(m.toUpperCase(), path, Array.prototype.slice.call(arguments, 1), false);
    };
});

// 'delete' is a reserved word — must be defined separately
Router.prototype['delete'] = function(path) {
    return this._add('DELETE', path, Array.prototype.slice.call(arguments, 1), false);
};

module.exports = Router;

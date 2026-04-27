// ============================================================================
// Router — Lightweight Express.js-compatible Router for user functions
//
// Usage in user code (Router is a global — no require() needed):
//
//   const router = new Router();
//
//   router.get('/', (req, res) => res.json({ hello: 'world' }));
//   router.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
//   router.use((req, res) => res.status(404).send('Not Found'));
//
//   module.exports = router;
//
// The Router constructor returns a callable function so that
// `typeof new Router() === 'function'`, satisfying the execution engine's
// export check without any engine modifications.
// ============================================================================

import { match } from 'path-to-regexp';
import type { InvokeRequest } from './exchange/request';
import type { InvokeResponse } from './exchange/response';

/**
 * Request handler used by the Invoke router.
 * @param req Incoming request object.
 * @param res Outgoing response object.
 * @param next Optional callback to continue to the next matching handler.
 * @returns Any value returned by the handler.
 */
export type InvokeHandler = (req: InvokeRequest, res: InvokeResponse, next?: (err?: unknown) => void) => unknown;

/**
 * Express-style router API available through the global `Router` constructor.
 */
export interface InvokeRouter {
  /**
   * Register middleware for all routes that match a path prefix.
   * @param path Path prefix to match.
   * @param handlers Middleware handlers.
   * @returns The router instance.
   */
  use(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register global middleware.
   * @param handlers Middleware handlers.
   * @returns The router instance.
   */
  use(...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP GET.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  get(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP POST.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  post(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP PUT.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  put(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP PATCH.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  patch(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP DELETE.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  delete(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP OPTIONS.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  options(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for HTTP HEAD.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  head(path: string, ...handlers: InvokeHandler[]): this;
  /**
   * Register a handler for all HTTP methods.
   * @param path Route path.
   * @param handlers Route handlers.
   * @returns The router instance.
   */
  all(path: string, ...handlers: InvokeHandler[]): this;
}

declare global {
  /**
   * Global router constructor for creating reusable route handlers.
   */
  var Router: new () => InvokeRouter;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'options', 'head'] as const;

/** @internal */
type MatchFn = (path: string) => { path: string; params: Record<string, unknown> } | false;
/** @internal */
type Handler = (req: any, res: any, next?: (err?: unknown) => void) => unknown;

/** @internal */
interface Layer {
  method: string | null;
  matchFn: MatchFn;
  handler: Handler;
}

/** Match-all function used by use() with no path. */
function matchAll(): { path: string; params: Record<string, unknown> } {
  return { path: '/', params: {} };
}

/**
 * Build a match function for the given path.
 * @param path - null/undefined → match all
 * @param prefix - true for use() (prefix match), false for route methods (exact match)
 */
function buildMatchFn(path: string | null | undefined, prefix: boolean): MatchFn {
  if (path === null || path === undefined) return matchAll;
  const normalised = path === '' ? '/' : path;
  return match(normalised, { decode: decodeURIComponent, end: !prefix }) as unknown as MatchFn;
}

// ─── Router (callable-class pattern) ─────────────────────────────────────────

function RouterFactory(this: any): any {
  const router: any = function (req: any, res: any) {
    return router._dispatch(req, res);
  };
  Object.setPrototypeOf(router, (RouterFactory as any).prototype);
  router._stack = [] as Layer[];
  return router;
}

/**
 * Internal: add a layer to the stack.
 */
RouterFactory.prototype._add = function (
  method: string | null,
  path: string | null,
  handlers: Handler[],
  prefix: boolean,
): any {
  const matchFn = buildMatchFn(path, prefix);
  const flat: Handler[] = ([] as Handler[]).concat(...(handlers as any[]));
  for (const handler of flat) {
    if (typeof handler !== 'function') {
      throw new TypeError('Router handlers must be functions, got ' + typeof handler);
    }
    (this._stack as Layer[]).push({ method, matchFn, handler });
  }
  return this;
};

/**
 * Dispatch an incoming request through the route stack.
 * Returns a Promise that resolves once a response has been sent or a 404 is issued.
 */
RouterFactory.prototype._dispatch = function (req: any, res: any): Promise<void> {
  const self = this;
  return new Promise<void>(function (resolve) {
    const stack: Layer[] = self._stack;
    let idx = 0;
    const path: string = req.path || (req.url ? req.url.split('?')[0] : '/') || '/';
    const method: string = (req.method || 'GET').toUpperCase();

    function done(err?: unknown): void {
      if (err && !res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, message: msg });
      } else if (!res.headersSent) {
        res.status(404).json({ success: false, message: 'Cannot ' + method + ' ' + path });
      }
      resolve();
    }

    function next(err?: unknown): void {
      if (err) { done(err); return; }

      while (idx < stack.length) {
        const layer = stack[idx++];

        // Skip if wrong HTTP method
        if (layer.method !== null && layer.method !== 'ALL' && layer.method !== method) {
          continue;
        }

        // Match path
        let matched: ReturnType<MatchFn>;
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
        const callNext = function (e?: unknown) {
          if (called) return;
          called = true;
          req.params = prevParams;
          next(e);
        };

        let result: unknown;
        try {
          result = layer.handler(req, res, callNext);
        } catch (e) {
          req.params = prevParams;
          done(e);
          return;
        }

        if (result && typeof (result as any).then === 'function') {
          // Async handler: wait for it to complete
          (result as Promise<unknown>).then(
            function () { if (!called) resolve(); },
            function (e: unknown) { if (!called) { req.params = prevParams; done(e); } },
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
RouterFactory.prototype.use = function (path: string | Handler, ...rest: Handler[]): any {
  let handlers: Handler[];
  let routePath: string | null;

  if (typeof path === 'function') {
    routePath = null;
    handlers = [path, ...rest];
  } else if (typeof path === 'string') {
    routePath = path;
    handlers = rest;
  } else {
    routePath = null;
    handlers = rest;
  }
  return this._add(null, routePath, handlers, true);
};

/** Register a handler for all HTTP methods on the given path. */
RouterFactory.prototype.all = function (path: string, ...handlers: Handler[]): any {
  return this._add('ALL', path, handlers, false);
};

// Register .get(), .post(), .put(), .patch(), .options(), .head()
for (const m of HTTP_METHODS) {
  RouterFactory.prototype[m] = function (path: string, ...handlers: Handler[]): any {
    return this._add(m.toUpperCase(), path, handlers, false);
  };
}

// 'delete' is a reserved word — must be defined separately
(RouterFactory.prototype as any)['delete'] = function (path: string, ...handlers: Handler[]): any {
  return this._add('DELETE', path, handlers, false);
};

/**
 * Wire up the Router global so user code can use `new Router()` without any imports.
 * @internal
 */
export function setupRouterGlobal(): void {
  (globalThis as any).Router = RouterFactory;
}

/** @internal */
export const Router = RouterFactory as unknown as new () => any;

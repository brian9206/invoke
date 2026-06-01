declare module 'router' {
  type NextFunction = (err?: unknown) => void
  type RequestHandler = (req: any, res: any, next: NextFunction) => void
  type ErrorHandler = (err: unknown, req: any, res: any, next: NextFunction) => void

  interface RouterOptions {
    strict?: boolean
    caseSensitive?: boolean
    mergeParams?: boolean
  }

  interface Router {
    (req: any, res: any, next: NextFunction): void

    use(path: string, ...handlers: (RequestHandler | ErrorHandler)[]): this
    use(...handlers: (RequestHandler | ErrorHandler)[]): this

    get(path: string, ...handlers: RequestHandler[]): this
    post(path: string, ...handlers: RequestHandler[]): this
    put(path: string, ...handlers: RequestHandler[]): this
    patch(path: string, ...handlers: RequestHandler[]): this
    delete(path: string, ...handlers: RequestHandler[]): this
    options(path: string, ...handlers: RequestHandler[]): this
    head(path: string, ...handlers: RequestHandler[]): this
    all(path: string, ...handlers: RequestHandler[]): this
  }

  function createRouter(options?: RouterOptions): Router
  export = createRouter
}

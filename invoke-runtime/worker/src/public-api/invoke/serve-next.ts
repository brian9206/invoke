import fs from 'fs'
import path from 'path'
import serveStatic from './serve-static'
import { Router } from '../router'
import type { InvokeHandler } from '../exchange'

export interface ServeNextOptions {
  /**
   * Directory where public assets are located. Defaults to 'public'.
   */
  publicDir?: string | undefined

  /**
   * Directory where Next.js static assets are located. Defaults to '.next/static'.
   */
  staticDir?: string | undefined

  /**
   * Directory where the Next.js standalone build is located. Defaults to '.next/standalone'.
   */
  standaloneDir?: string | undefined

  /**
   * Prefix for cache keys in the KV store. Defaults to 'next-cache'. This is useful when you are hosting multiple ISR app in the same project.
   */
  cachePrefix?: string | undefined

  /**
   * Enable or disable setting Cache-Control response header, defaults to true.
   * Disabling this will ignore the immutable and maxAge options.
   */
  cacheControl?: boolean | undefined

  /**
   * Set how "dotfiles" are treated when encountered. A dotfile is a file or directory that begins with a dot (".").
   * Note this check is done on the path itself without checking if the path actually exists on the disk.
   * If root is specified, only the dotfiles above the root are checked (i.e. the root itself can be within a dotfile when when set to "deny").
   * The default value is 'ignore'.
   * 'allow' No special treatment for dotfiles
   * 'deny' Send a 403 for any request for a dotfile
   * 'ignore' Pretend like the dotfile does not exist and call next()
   */
  dotfiles?: string | undefined

  /**
   * Enable or disable etag generation, defaults to true.
   */
  etag?: boolean | undefined

  /**
   * Enable or disable the immutable directive in the Cache-Control response header.
   * If enabled, the maxAge option should also be specified to enable caching. The immutable directive will prevent supported clients from making conditional requests during the life of the maxAge option to check if the file has changed.
   */
  immutable?: boolean | undefined

  /**
   * Enable or disable Last-Modified header, defaults to true. Uses the file system's last modified value.
   */
  lastModified?: boolean | undefined

  /**
   * Provide a max-age in milliseconds for http caching, defaults to 0. This can also be a string accepted by the ms module.
   */
  maxAge?: number | string | undefined
}

export default function createServeNextHandler(options?: ServeNextOptions): InvokeHandler {
  const NextNodeServer = require(path.resolve('node_modules/next/dist/server/next-server')).default

  const standaloneDir = options?.standaloneDir || path.resolve('.next', 'standalone')
  const requiredServerFiles = fs.readFileSync(path.join(standaloneDir, '.next', 'required-server-files.json'), 'utf-8')
  const conf = JSON.parse(requiredServerFiles).config

  const cachePrefix = options?.cachePrefix || 'next-cache'

  class InvokeKVCacheHandler {
    // Next.js calls this to look up cached HTML / fetch data
    async get(key: any) {
      try {
        const cachedData = await kv.get(`${cachePrefix}:${key}`)
        if (!cachedData) return null

        // Parse the stored payload
        const entry = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData

        // If the cache entry has tags attached to it, check if any of them are stale
        if (entry.tags && entry.tags.length > 0) {
          for (const tag of entry.tags) {
            const tagBustTime = await kv.get(`${cachePrefix}-tag:${tag}`)

            // If a tag revalidation timestamp exists and is NEWER than when this page was cached,
            // it means the cache has been broken. Return null to force a re-render.
            if (tagBustTime && Number(tagBustTime) > entry.lastModified) {
              return null
            }
          }
        }

        // If everything is fresh, return just the 'value' payload that Next.js expects
        return entry
      } catch (error) {
        console.error('Cache read error:', error)
        return null
      }
    }

    // Next.js calls this when saving ISR pages or fetch data
    async set(key: any, data: any, ctx: any) {
      try {
        // ctx contains tags and an optional revalidate timeout (TTL)
        const ttl = ctx.revalidate

        // CRITICAL: We add 'tags' to the saved object so 'get()' can inspect them later
        const payload = JSON.stringify({
          value: data,
          lastModified: Date.now(),
          tags: ctx.tags || []
        })

        if (ttl) {
          // Save to your KV with an absolute expiration time
          await kv.set(`${cachePrefix}:${key}`, payload, ttl)
        } else {
          // Save indefinitely
          await kv.set(`${cachePrefix}:${key}`, payload)
        }
      } catch (error) {
        console.error('Cache write error:', error)
      }
    }

    // Next.js calls this for on-demand revalidation (revalidateTag)
    async revalidateTag(tag: any) {
      try {
        // Instead of hunting down and deleting all page keys,
        // we simply stamp the exact millisecond this tag was busted.
        await kv.set(`next-tag:${tag}`, String(Date.now()))
      } catch (error) {
        console.error('Tag revalidation error:', error)
      }
    }
  }

  conf.cacheMaxMemorySize = 0 // Force 0 bytes memory cache
  conf.experimental = {
    ...conf.experimental,
    incrementalCacheHandlers: {
      customHandler: InvokeKVCacheHandler
    }
  }
  conf.incrementalCacheHandlers = conf.experimental.incrementalCacheHandlers

  const nextServer = new NextNodeServer({
    dir: standaloneDir,
    conf,
    dev: false
  })

  const nextHandler = nextServer.getRequestHandler()

  const app = new Router()

  app.use(
    '/_next/static',
    serveStatic(options?.staticDir || '.next/static', {
      ...options,
      fallthrough: true
    })
  )

  app.use(
    '/',
    serveStatic(options?.publicDir || 'public', {
      ...options,
      fallthrough: true
    })
  )

  app.use(nextHandler)

  return app
}

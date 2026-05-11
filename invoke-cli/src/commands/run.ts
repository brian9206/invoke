import chalk from 'chalk'
import dotenv from 'dotenv'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import type { Command } from 'commander'
import { createReqObject, createResObject, stateToResponseData } from 'invoke-worker/src/public-api/exchange'
import { setupEnvironment } from 'invoke-worker/src/environment'
import { IpcChannel, NoOpIpcChannel, type RequestData } from 'invoke-worker/src/protocol'
import { INVOKE_SDK_NUPKG_BASE64, INVOKE_SDK_NUPKG_FILENAME } from '../config/invoke-sdk-nupkg'

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildRequestData(options: any): RequestData {
  const headers: Record<string, string> = {}
  for (const raw of options.header as string[]) {
    const sep = raw.indexOf(':')
    if (sep === -1) {
      console.warn(chalk.yellow(`Warning: ignoring malformed header "${raw}" (expected key:value)`))
      continue
    }
    headers[raw.slice(0, sep).trim().toLowerCase()] = raw.slice(sep + 1).trim()
  }

  let body: any = {}
  if (options.data) {
    try {
      body = JSON.parse(options.data)
    } catch {
      console.error(chalk.red('✗ --data is not valid JSON'))
      process.exit(1)
    }
  }

  const reqUrl = (options.path || '/').startsWith('/') ? options.path : '/' + options.path

  return {
    method: options.method.toUpperCase(),
    url: reqUrl,
    originalUrl: reqUrl,
    path: reqUrl.split('?')[0],
    protocol: 'http',
    hostname: 'localhost',
    secure: false,
    ip: '127.0.0.1',
    ips: [],
    body,
    query: {},
    params: {},
    headers: { 'content-type': 'application/json', ...headers }
  }
}

function printResponse(statusCode: number, headers: Record<string, any>, bodyBase64: string | null): void {
  console.log('\n' + (statusCode >= 400 ? chalk.red('=== Response ===') : chalk.cyan('=== Response ===')))
  const statusColor = statusCode >= 400 ? chalk.red : chalk.green
  console.log(`Status: ${statusColor(statusCode)}`)

  if (Object.keys(headers).length > 0) {
    console.log('\n' + chalk.gray('Response Headers:'))
    for (const [key, value] of Object.entries(headers)) {
      console.log(`${key}: ${Array.isArray(value) ? (value as string[]).join(', ') : value}`)
    }
  }

  console.log('\n' + chalk.gray('Response Body:'))
  if (bodyBase64) {
    const bodyStr = Buffer.from(bodyBase64, 'base64').toString('utf8')
    try {
      console.log(JSON.stringify(JSON.parse(bodyStr), null, 2))
    } catch {
      console.log(bodyStr)
    }
  }
}

// ── Bun / JS in-process runner ────────────────────────────────────────────────

async function runBun(absoluteFnDir: string, requestData: RequestData, options: any): Promise<void> {
  const packageJsonPath = path.join(absoluteFnDir, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    console.error(chalk.red(`✗ package.json not found in: ${absoluteFnDir}`))
    process.exit(1)
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const indexPath = path.resolve(
    absoluteFnDir,
    packageJson.main || (fs.existsSync(path.join(absoluteFnDir, 'index.js')) ? 'index.js' : 'index.ts')
  )

  console.log(chalk.cyan(`▶ Running (bun): ${absoluteFnDir}`))
  if (options.kvFile) {
    console.log(chalk.gray(`  KV store: ${path.resolve(options.kvFile)}`))
  } else {
    console.log(chalk.gray('  KV store: in-memory'))
  }
  console.log('')

  setupEnvironment(new NoOpIpcChannel())

  const userModule = require(indexPath)
  const handler =
    typeof userModule === 'function' ? userModule : typeof userModule.default === 'function' ? userModule.default : null

  if (!handler) {
    console.error(chalk.red('✗ Module must export a function. Expected: module.exports = function(req, res) {...}'))
    process.exitCode = 1
    return
  }

  const req = createReqObject(requestData)
  const { res, state } = createResObject(req)

  const result = handler(req, res)
  if (result && typeof result.then === 'function') {
    await result
  }

  const responseData = stateToResponseData(state)
  printResponse(responseData.statusCode, responseData.headers, responseData.body)
}

// ── Dotnet runner via TCP testing mode ────────────────────────────────────────

/**
 * Ensure the embedded nupkg is extracted to ~/.invoke/nuget/ and return the dir path.
 */
function ensureNugetFeed(): string {
  const nugetDir = path.join(os.homedir(), '.invoke', 'nuget')
  fs.mkdirSync(nugetDir, { recursive: true })
  const nupkgDest = path.join(nugetDir, INVOKE_SDK_NUPKG_FILENAME)
  // Always overwrite to ensure the embedded version is current
  fs.writeFileSync(nupkgDest, Buffer.from(INVOKE_SDK_NUPKG_BASE64, 'base64'))
  return nugetDir
}

/**
 * Write a nuget.config in the function directory pointing to the local feed.
 * Returns true if we created the file (so the caller knows to clean it up).
 */
function ensureNugetConfig(fnDir: string, nugetDir: string): boolean {
  const nugetConfigPath = path.join(fnDir, 'nuget.config')
  if (fs.existsSync(nugetConfigPath)) return false
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<configuration>',
    '  <packageSources>',
    `    <add key="invoke-sdk-local" value="${nugetDir}" />`,
    `    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />`,
    '  </packageSources>',
    '</configuration>',
    ''
  ].join('\n')
  fs.writeFileSync(nugetConfigPath, xml)
  return true
}

function runDotnet(
  absoluteFnDir: string,
  requestData: RequestData,
  envVars: Record<string, string>,
  isDebug: boolean
): Promise<void> {
  // Set up local NuGet feed with embedded SDK package
  const nugetDir = ensureNugetFeed()
  const createdNugetConfig = ensureNugetConfig(absoluteFnDir, nugetDir)
  const nugetConfigPath = path.join(absoluteFnDir, 'nuget.config')

  // In-memory KV store for this local run session
  const kvStore = new Map<string, { value: unknown; expiresAt?: number }>()

  return new Promise<void>((resolve, reject) => {
    // Start TCP server on a random port
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      const port = addr.port
      const host = `127.0.0.1:${port}`

      console.log(chalk.cyan(`▶ Running (dotnet): ${absoluteFnDir}`))
      console.log(chalk.gray(`  Testing mode host: ${host}`))
      console.log('')

      // Use a dedicated NuGet package cache so the global ~/.nuget/packages/
      // (which may hold a stale Invoke.SDK) is bypassed.
      const nugetPackagesDir = path.join(os.homedir(), '.invoke', 'nuget-cache')
      fs.mkdirSync(nugetPackagesDir, { recursive: true })
      const child = spawn('dotnet', ['run'], {
        cwd: absoluteFnDir,
        env: {
          ...process.env,
          ...envVars,
          NUGET_PACKAGES: nugetPackagesDir,
          INVOKE_TESTING_MODE: isDebug ? 'debug' : 'true',
          INVOKE_TESTING_MODE_HOST: host
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      if (isDebug) {
        console.log(chalk.yellow(`⚠️  PID ${child.pid} started. Waiting for debugger to attach...`))
      }

      // Forward child stdout/stderr (build output) as visible lines
      child.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) if (line.trim()) console.log(chalk.gray(`[build] ${line}`))
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) if (line.trim()) console.log(chalk.yellow(`[build] ${line}`))
      })

      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        if (createdNugetConfig) {
          try {
            fs.unlinkSync(nugetConfigPath)
          } catch {}
        }
        server.close()
        if (!child.killed) child.kill()
        if (err) reject(err)
        else resolve()
      }

      // Allow up to 3 minutes for the initial dotnet build/restore, then
      // reset to a 30s window once the function actually connects.
      let timeout = setTimeout(
        () => done(new Error('Timed out waiting for dotnet to build and connect (3m). Check for build errors above.')),
        3 * 60_000
      )
      timeout.unref()

      child.on('error', err => done(new Error(`Failed to spawn dotnet: ${err.message}`)))
      child.on('exit', (code, signal) => {
        if (!settled) done(new Error(`dotnet process exited unexpectedly (code=${code}, signal=${signal})`))
      })

      // Accept the single connection from the dotnet binary
      server.once('connection', tcpSocket => {
        // Reset to a tighter execution timeout now that the process has connected.
        clearTimeout(timeout)
        timeout = setTimeout(() => done(new Error('Timed out waiting for dotnet function response (30s)')), 30_000)
        timeout.unref()
        server.close()

        // Wrap the TCP socket in IpcChannel — reuses the full EventDecoder +
        // NDJSON framing instead of hand-rolling buffer parsing.
        const ipc = IpcChannel.fromSocket(tcpSocket)

        ipc.on('payload', () => {
          ipc.emit('payload', { type: 'execute', request: requestData })
        })

        ipc.on('console_log', (payload: any) => {
          const level: string = payload?.level ?? 'log'
          const msg: string = (payload?.args ?? []).join(' ')

          if (level === 'error') {
            console.error(msg)
          } else {
            console.log(msg)
          }
        })

        ipc.on('execute_result', (payload: any) => {
          clearTimeout(timeout)
          const response = payload?.response
          if (response) printResponse(response.statusCode ?? 200, response.headers ?? {}, response.body ?? null)
          tcpSocket.destroy()
          done()
        })

        ipc.on('worker_error', (payload: any) => {
          clearTimeout(timeout)
          const errorMsg: string = payload?.error ?? 'Unknown error'
          console.error(chalk.red('\n✗ Function error:\n') + errorMsg)
          tcpSocket.destroy()
          done(new Error(errorMsg))
        })

        ipc.on('kv_get', (payload: any) => {
          const { id, key } = payload ?? {}
          const entry = kvStore.get(key)
          if (!entry || (entry.expiresAt !== undefined && Date.now() > entry.expiresAt)) {
            kvStore.delete(key)
            ipc.emit('kv_result', { id })
          } else {
            ipc.emit('kv_result', { id, value: entry.value })
          }
        })

        ipc.on('kv_set', (payload: any) => {
          const { id, key, value, ttl } = payload ?? {}
          try {
            const parsed = JSON.parse(value)
            const entry: { value: unknown; expiresAt?: number } = { value: parsed }
            if (ttl) entry.expiresAt = Date.now() + Number(ttl)
            kvStore.set(key, entry)
            ipc.emit('kv_result', { id, value: true })
          } catch {
            ipc.emit('kv_result', { id, error: 'Failed to parse value' })
          }
        })

        ipc.on('kv_delete', (payload: any) => {
          const { id, key } = payload ?? {}
          const existed = kvStore.has(key)
          kvStore.delete(key)
          ipc.emit('kv_result', { id, value: existed })
        })

        ipc.on('kv_list', (payload: any) => {
          const { id, prefix } = payload ?? {}
          const keys = [...kvStore.keys()].filter(k => {
            if (prefix && !k.startsWith(prefix)) return false
            const entry = kvStore.get(k)
            if (!entry) return false
            if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
              kvStore.delete(k)
              return false
            }
            return true
          })
          ipc.emit('kv_result', { id, value: keys })
        })

        ipc.on('error', (err: Error) => {
          clearTimeout(timeout)
          done(err)
        })
        ipc.on('close', () => {
          if (!settled) done(new Error('dotnet socket closed before execute_result'))
        })
      })

      server.on('error', err => done(new Error(`TCP server error: ${err.message}`)))
    })
  })
}

// ── Command registration ──────────────────────────────────────────────────────

export function register(program: Command): void {
  program
    .command('run [path]')
    .description('Run a function locally (supports bun/js and dotnet)')
    .option('-m, --method <method>', 'HTTP method', 'GET')
    .option('-p, --path <urlpath>', 'Request path', '/')
    .option('-d, --data <json>', 'Request body as a JSON string')
    .option(
      '-H, --header <key:value>',
      'Request header (repeatable)',
      (val: string, acc: string[]) => {
        acc.push(val)
        return acc
      },
      [] as string[]
    )
    .option('-e, --env <file>', 'Path to a .env file to load (defaults to <path>/.env)')
    .option('--kv-file <file>', 'JSON file for KV store persistence (default: in-memory)')
    .option('--debug', 'Enable debug mode (wait for debugger to attach)')
    .action(async (fnPath: string | undefined, options: any) => {
      fnPath = fnPath || '.'
      const absoluteFnDir = path.resolve(fnPath)

      if (!fs.existsSync(absoluteFnDir)) {
        console.error(chalk.red(`✗ Directory not found: ${absoluteFnDir}`))
        process.exit(1)
      }

      // Load .env for the function
      const envFile = options.env || path.join(absoluteFnDir, '.env')
      const envVars: Record<string, string> = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) || {} : {}

      const requestData = buildRequestData(options)

      // Detect runtime
      try {
        if (fs.readdirSync(absoluteFnDir).some(f => f.endsWith('.csproj'))) {
          await runDotnet(absoluteFnDir, requestData, envVars, options.debug)
        } else if (fs.existsSync(path.join(absoluteFnDir, 'package.json'))) {
          // Inject env vars into process for in-process bun runner
          for (const [key, value] of Object.entries(envVars)) {
            process.env[key] = value
          }
          await runBun(absoluteFnDir, requestData, options)
        } else {
          console.error(chalk.red(`✗ No supported function entry point found in: ${absoluteFnDir}`))
          console.error(chalk.gray('  Expected: package.json (bun) or *.csproj (dotnet)'))
          process.exit(1)
        }
      } catch (err: any) {
        console.error(chalk.red('✗ Execution failed:'), err.message)
        if (err.stack) console.error(chalk.gray(err.stack))
        process.exitCode = 1
      }
    })
}

// ============================================================================
// Integration test — SandboxOrchestrator + Sandbox
//
// Tests:
//   1. IPC text   — host→container ping, container→host pong
//   2. IPC binary — round-trip binary buffer through IPC
//   3. Network blocked  — filter=false, container HTTP GET fails
//   4. Network allowed  — filter=true, container HTTP GET succeeds
//
// Run:
//   node --require @swc-node/register tests/sandbox.integration.ts
//
// Env vars:
//   SANDBOX_RUNTIME=runc           Docker runtime (default: runc)
//   DOCKER_SOCKET=/var/run/docker.sock
//   SKIP_NETWORK_TESTS=1           Skip tests 3 & 4 (needed when gVisor unavailable)
//   WORKDIR=/tmp/invoke-sandbox-test
// ============================================================================

import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import net from 'net'
import path from 'path'
import os from 'os'
import { SandboxOrchestrator, Sandbox } from '../src/services/sandbox/index'

const execFile = promisify(execFileCb)

// ── Config ───────────────────────────────────────────────────────────────────

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'
const SANDBOX_RUNTIME = process.env.SANDBOX_RUNTIME ?? 'runc'
const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === '1'
const WORKDIR = process.env.WORKDIR ?? path.join(os.tmpdir(), 'invoke-sandbox-test-' + Date.now())
const IMAGE = 'invoke-sandbox-test:latest'
const CONTAINER_DIR = path.join(__dirname, 'sandbox-test-container')

// ── Simple test runner ───────────────────────────────────────────────────────

let passed = 0
let failed = 0

function pass(label: string): void {
  console.log('  \x1b[32m✓\x1b[0m', label)
  passed++
}

function fail(label: string, err: unknown): void {
  console.error('  \x1b[31m✗\x1b[0m', label, '-', (err as Error).message)
  failed++
}

async function test(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    pass(label)
  } catch (err) {
    fail(label, err)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for a named event on the sandbox with a timeout. */
function waitFor<T = unknown>(sandbox: Sandbox, event: string, timeoutMs = 15_000): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms) waiting for '${event}'`)), timeoutMs)
    sandbox.once(event, (...args: unknown[]) => {
      clearTimeout(timer)
      resolve(args as T[])
    })
  })
}

/** Start a minimal HTTP server on a random port, returns { server, url }. */
function startHttpServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('OK')
    })

    server.listen(0, '0.0.0.0', () => {
      const addr = server.address() as net.AddressInfo
      const hostIP = getHostIP()
      resolve({ server, url: `http://${hostIP}:${addr.port}` })
    })

    server.on('error', reject)
  })
}

/** Best-effort: find the host's non-loopback IPv4 address. */
function getHostIP(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Build test image
  console.log('\n[setup] Building test container image...')
  try {
    await execFile('docker', ['build', '-t', IMAGE, CONTAINER_DIR], { timeout: 120_000 })
    console.log('[setup] Image built:', IMAGE)
  } catch (err) {
    console.error('[setup] docker build failed:', (err as Error).message)
    process.exit(1)
  }

  // 2. Start a local HTTP server for networking tests
  const { server: httpServer, url: httpUrl } = await startHttpServer()
  const addr = httpServer.address() as net.AddressInfo
  console.log(`[setup] Test HTTP server listening at ${httpUrl}`)

  // 3. Init orchestrator
  const orchestrator = new SandboxOrchestrator({
    workdir: WORKDIR,
    socket: DOCKER_SOCKET,
    image: IMAGE,
    runtime: SANDBOX_RUNTIME,
    filesystem: [],
    env: {},
    caps: []
  })

  try {
    await orchestrator.init()
    console.log('[setup] Orchestrator initialized, workdir:', WORKDIR)
  } catch (err) {
    console.error('[setup] orchestrator.init() failed:', (err as Error).message)
    httpServer.close()
    process.exit(1)
  }

  try {
    await orchestrator.setNetwork({
      name: 'sb-net-test',
      rules: [{ cidr: '192.168.0.0/16', action: 'DROP' }]
    })
    console.log('[setup] create network sb-net-test')
  } catch (err) {
    console.error('[setup] orchestrator.init() failed:', (err as Error).message)
    httpServer.close()
    process.exit(1)
  }

  // 4. Spawn sandbox
  let sandbox: Sandbox
  try {
    sandbox = await orchestrator.spawn({
      resources: { memory: { limit: 128 * 1024 * 1024 } },
      network: 'sb-net-test'
    })
    console.log('[setup] Sandbox spawned:', sandbox.id)
  } catch (err) {
    console.error('[setup] spawn() failed:', (err as Error).message)
    httpServer.close()
    process.exit(1)
  }

  // Forward sandbox stdout/stderr so we can see container logs on failure
  sandbox.on('stdout', (d: Buffer) => process.stdout.write('[container] ' + d.toString()))
  sandbox.on('stderr', (d: Buffer) => process.stderr.write('[container:err] ' + d.toString()))

  // 5. Wait for container to connect and send 'ready'
  console.log('\n[wait] Waiting for container IPC ready...')
  try {
    await waitFor(sandbox, 'ready', 20_000)
    console.log('[wait] Container is ready\n')
  } catch (err) {
    console.error('[wait] Container never sent ready:', (err as Error).message)
    await sandbox.destroy()
    httpServer.close()
    process.exit(1)
  }

  // ── IPC Tests ──────────────────────────────────────────────────────────────

  console.log('── IPC Tests ──')

  await test('IPC text: ping → pong (string payload)', async () => {
    const [pong] = await Promise.all([
      waitFor<string>(sandbox, 'pong'),
      Promise.resolve(sandbox.emit('ping', 'hello-ipc'))
    ])
    if (pong[0] !== 'hello-ipc') {
      throw new Error(`Expected payload 'hello-ipc', got '${pong[0]}'`)
    }
  })

  await test('IPC text: ping → pong (object payload)', async () => {
    const [pong] = await Promise.all([
      waitFor<unknown>(sandbox, 'pong'),
      Promise.resolve(sandbox.emit('ping', { msg: 'world', n: 42 }))
    ])
    const p = pong[0] as { msg: string; n: number }
    if (p.msg !== 'world' || p.n !== 42) {
      throw new Error(`Payload mismatch: ${JSON.stringify(p)}`)
    }
  })

  await test('IPC binary: ping-binary → pong-binary (buffer echo)', async () => {
    // Build a 256-byte buffer with deterministic content
    const sentBuffer = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) sentBuffer[i] = i

    const [returnedPayload, returnedBuffer] = await new Promise<[unknown, Buffer]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout (15s) waiting for pong-binary')), 15_000)
      sandbox.once('pong-binary', (payload: unknown, buf: Buffer) => {
        clearTimeout(timer)
        resolve([payload, buf])
      })
      sandbox.emit('ping-binary', { tag: 'buf-test' }, sentBuffer)
    })

    if (!(returnedBuffer instanceof Buffer)) {
      throw new Error('Expected Buffer, got: ' + typeof returnedBuffer)
    }
    if (returnedBuffer.length !== sentBuffer.length) {
      throw new Error(`Buffer length mismatch: ${returnedBuffer.length} !== ${sentBuffer.length}`)
    }
    if (!returnedBuffer.equals(sentBuffer)) {
      throw new Error('Buffer contents do not match')
    }
    if ((returnedPayload as any)?.tag !== 'buf-test') {
      throw new Error('Payload mismatch on binary event')
    }
  })

  // ── Network Tests ──────────────────────────────────────────────────────────

  if (SKIP_NETWORK) {
    console.log('\n── Network Tests (SKIPPED — set SKIP_NETWORK_TESTS=1) ──')
  } else {
    console.log(`\n── Network Tests (runtime: ${SANDBOX_RUNTIME}, server: ${httpUrl}) ──`)
    console.log(
      SANDBOX_RUNTIME === 'runc' ? '  note: using runc — NetworkMode=none means no network; expecting failures\n' : ''
    )

    await test('Network: blocked by default filter (filter=false)', async () => {
      const [[result]] = await Promise.all([
        waitFor<{ ok: boolean; error?: string }>(sandbox, 'http-result'),
        Promise.resolve(sandbox.emit('http-test', httpUrl))
      ])
      if (result.ok) {
        throw new Error('Expected HTTP request to be blocked, but it succeeded')
      }
    })

    await test('Network: allowed after filter update (filter=true)', async () => {
      try {
        await orchestrator.setNetwork({
          name: 'sb-net-test',
          rules: [{ cidr: '192.168.0.0/16', action: 'RETURN' }]
        })
        console.log('[setup] set network sb-net-test to allow')
      } catch (err) {
        console.error('[setup] orchestrator.init() failed:', (err as Error).message)
        httpServer.close()
        process.exit(1)
      }

      const [[result]] = await Promise.all([
        waitFor<{ ok: boolean; status?: number }>(sandbox, 'http-result'),
        Promise.resolve(sandbox.emit('http-test', httpUrl))
      ])
      if (!result.ok) {
        throw new Error(`Expected HTTP request to succeed, but got error ` + JSON.stringify(result.error))
      }
      if (result.status !== 200) {
        throw new Error(`Expected status 200, got ${result.status}`)
      }
    })

    await test('Network: re-blocked after filter reset (filter=false)', async () => {
      try {
        await orchestrator.setNetwork({
          name: 'sb-net-test',
          rules: [{ cidr: '192.168.0.0/16', action: 'DROP' }]
        })
        console.log('[setup] set network sb-net-test to block')
      } catch (err) {
        console.error('[setup] orchestrator.init() failed:', (err as Error).message)
        httpServer.close()
        process.exit(1)
      }

      const [[result]] = await Promise.all([
        waitFor<{ ok: boolean; error?: string }>(sandbox, 'http-result'),
        Promise.resolve(sandbox.emit('http-test', httpUrl))
      ])
      if (result.ok) {
        throw new Error('Expected HTTP request to be blocked after reset, but it succeeded')
      }
    })
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  console.log('\n[cleanup] Destroying sandbox...')
  await sandbox.destroy()
  console.log('[cleanup] Sandbox destroyed')

  httpServer.close()

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})

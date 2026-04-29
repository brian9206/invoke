/// <reference path="./dist/ambient.d.ts" />

// Test all exported types from ambient.d.ts

// ============================================================================
// sleep function
// ============================================================================
const sleepTest: typeof sleep = async (ms: number) => {
  await sleep(100)
}

// ============================================================================
// Router and InvokeHandler
// ============================================================================
const handlerTest: InvokeHandler = (req, res, next) => {
  return res.json({ ok: true })
}

const router = new Router()
router.get('/', handlerTest)
router.post('/api', (req, res) => res.status(201).json(req.body))
router.use((req, res, next) => {
  console.log(req.method, req.path)
  next?.()
})

// ============================================================================
// InvokeRequest properties
// ============================================================================
const requestTest = (req: InvokeRequest) => {
  const method: string = req.method
  const url: string = req.url
  const path: string = req.path
  const protocol: string = req.protocol
  const hostname: string = req.hostname
  const secure: boolean = req.secure
  const ip: string = req.ip
  const ips: string[] = req.ips
  const body: unknown = req.body
  const query: Record<string, string> = req.query
  const params: Record<string, string> = req.params
  const headers: Record<string, string> = req.headers
  const cookies: Record<string, string> = req.cookies
  const baseUrl: string = req.baseUrl
  const isXhr: boolean = req.xhr
  const subdomains: string[] = req.subdomains
  const contentType: string | false = req.is('application/json')
  const accepted: string | string[] | false = req.accepts('json')
  const param: unknown = req.param('id')
}

// ============================================================================
// InvokeResponse properties and methods
// ============================================================================
const responseTest = (res: InvokeResponse) => {
  const headersSent: boolean = res.headersSent
  const code: number = res.statusCode
  res.status(200)
  res.type('json')
  res.json({ data: 'test' })
  res.send('test')
  res.sendFile('/path/to/file.txt')
  res.download('/path/to/file.txt', 'filename.txt')
  res.redirect('/other')
  res.redirect(301, '/other')
  res.end()
  res.set('X-Custom', 'value')
  res.get('X-Custom')
  res.append('X-Custom', 'another')
  res.cookie('session', 'abc123', { httpOnly: true, secure: true })
  res.clearCookie('session')
}

// ============================================================================
// Logger
// ============================================================================
const loggerTest = () => {
  logger.trace('trace message')
  logger.debug('debug message')
  logger.info('info message')
  logger.warn('warn message')
  logger.error('error message')
  logger.fatal('fatal message')
  logger.child({ requestId: '123' })
}

// ============================================================================
// KV Store
// ============================================================================
const kvTest = async () => {
  await kv.set('key', 'value')
  const val = await kv.get('key')
  const exists = await kv.has('key')
  await kv.delete('key')
  await kv.clear()
}

// ============================================================================
// Realtime
// ============================================================================
const realtimeTest = () => {
  const ns = new RealtimeNamespace('/chat')
  const socket = ns.socket

  const socketId: string = socket.id
  const rooms: Set<string> = socket.rooms
  const handshake: Handshake = socket.handshake
  const connected: boolean = socket.connected
  const data: Record<string, unknown> = socket.data

  ns.to('room1').emit('message', 'hello')
  ns.in('room1').emit('update', { id: 1 })
  ns.except('room1').emit('broadcast', 'to all')

  socket.on('connect', () => {
    console.log('connected')
  })
  socket.emit('custom_event', { payload: 'data' })
}

// ============================================================================
// Helper functions
// ============================================================================
const helpersTest = () => {
  const cookies = parseCookies('session=abc; user=john')
  const normalized = normalizeMimeType('application/json')
  const matched = matchMimeType('application/json', 'application/*')
  const parsed = parseAcceptHeader('application/json, text/*;q=0.9')
}

// ============================================================================
// Main export
// ============================================================================
export default function handler(req: InvokeRequest, res: InvokeResponse) {
  res.json({ message: 'All types are working!' })
}

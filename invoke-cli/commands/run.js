const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const { createLocalKVFactory } = require('../services/local-kv')

function register(program) {
  program
    .command('run [path]')
    .description('Run a function locally using the same isolated-vm environment as the execution service')
    .option('-m, --method <method>', 'HTTP method', 'GET')
    .option('-p, --path <urlpath>', 'Request path', '/')
    .option('-d, --data <json>', 'Request body as a JSON string')
    .option('-H, --header <key:value>', 'Request header (repeatable)', (val, acc) => { acc.push(val); return acc }, [])
    .option('-e, --env <file>', 'Path to a .env file to load (defaults to <path>/.env)')
    .option('--kv-file <file>', 'JSON file for KV store persistence (default: in-memory)')
    .action(async (fnPath, options) => {
      fnPath = fnPath || '.'

      // Force pool size to 1 BEFORE requiring invoke-execution so IsolatePool
      // constructor reads the updated env vars.
      process.env.ISOLATE_POOL_SIZE = '1'
      process.env.ISOLATE_MAX_POOL_SIZE = '1'
      process.env.ISOLATE_SUPPRESS_LOGGING = 'true'
      process.env.REDIRECT_OUTPUT = 'no-func-id'

      const { ExecutionEngine } = require('invoke-execution/services/execution-engine')
      const dotenv = require('dotenv')

      const absoluteFnDir = path.resolve(fnPath)
      const indexPath = path.join(absoluteFnDir, 'index.js')

      if (!fs.existsSync(indexPath)) {
        console.error(chalk.red(`✗ index.js not found in: ${absoluteFnDir}`))
        process.exit(1)
      }

      // Load .env for the function
      const envFile = options.env || path.join(absoluteFnDir, '.env')
      const envVars = fs.existsSync(envFile) ? (dotenv.parse(fs.readFileSync(envFile)) || {}) : {}

      // Parse headers
      const headers = {}
      for (const raw of options.header) {
        const sep = raw.indexOf(':')
        if (sep === -1) { console.warn(chalk.yellow(`Warning: ignoring malformed header "${raw}" (expected key:value)`)); continue }
        headers[raw.slice(0, sep).trim().toLowerCase()] = raw.slice(sep + 1).trim()
      }

      // Parse body
      let body = {}
      if (options.data) {
        try { body = JSON.parse(options.data) } catch {
          console.error(chalk.red('✗ --data is not valid JSON')); process.exit(1)
        }
      }

      const reqUrl = (options.path || '/').startsWith('/') ? options.path : '/' + options.path

      const reqData = {
        method: options.method.toUpperCase(),
        url: reqUrl,
        originalUrl: reqUrl,
        path: reqUrl.split('?')[0],
        protocol: 'http',
        hostname: 'localhost',
        host: 'localhost',
        secure: false,
        ip: '127.0.0.1',
        ips: [],
        body,
        query: {},
        params: {},
        headers: { 'content-type': 'application/json', ...headers },
      }

      const engine = new ExecutionEngine({
        kvStoreFactory: createLocalKVFactory(options.kvFile),
        metadataProvider: async () => ({ package_hash: 'local', project_id: 'local' }),
        envVarsProvider: async () => envVars,
        networkPoliciesProvider: async () => ({ globalRules: [], projectRules: [] }),
      })

      try {
        console.log(chalk.cyan(`▶ Running: ${absoluteFnDir}`))
        if (options.kvFile) console.log(chalk.gray(`  KV store: ${path.resolve(options.kvFile)}`))
        else console.log(chalk.gray('  KV store: in-memory'))
        console.log('')

        await engine.initialize()

        const result = await engine.executeFunction(indexPath, { req: reqData }, 'local')

        if (result.error) {
          console.log('\n' + chalk.red('=== Error ==='))
          console.error(result.error)
          process.exitCode = 1
        } else {
          const statusColor = result.statusCode >= 400 ? chalk.red : chalk.green
          console.log('\n' + chalk.cyan('=== Response ==='))
          console.log(`Status: ${statusColor(result.statusCode)}`)

          if (result.headers) {
            console.log('\n' + chalk.gray('Response Headers:'))
            for (const [key, value] of Object.entries(result.headers)) {
              console.log(`${key}: ${value}`)
            }
          }

          console.log('\n' + chalk.gray('Response Body:'))
          if (result.data !== undefined) {
            const body = Buffer.isBuffer(result.data) ? result.data.toString('utf8') : String(result.data)
            try { console.log(JSON.stringify(JSON.parse(body), null, 2)) }
            catch { console.log(body) }
          }
        }
      } catch (err) {
        console.error(chalk.red('✗ Execution failed:'), err.message)
        process.exitCode = 1
      } finally {
        await engine.shutdown()
      }
    })
}

module.exports = { register }

import net from 'net'
import chalk from 'chalk'
import { ChildProcess, spawn } from 'child_process'
import type { Command } from 'commander'
import WebSocket from 'ws'
import { getApiKey, getSqlRelayUrl } from '../services/config'
import { resolveProjectId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('sql:connect')
    .description('Start a local PostgreSQL proxy tunnel to a project database')
    .requiredOption('--project <id>', 'Project ID, name, or @slug')
    .option('--port <port>', 'Local port to listen on', '5433')
    .action(async (options: any) => {
      try {
        const projectId = await resolveProjectId(options.project)
        const localPort = parseInt(options.port, 10)

        if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
          console.log(chalk.red('❌ Invalid port number'))
          process.exit(1)
        }

        const apiKey = getApiKey()
        if (!apiKey) {
          console.log(chalk.red('❌ No API key configured. Run `invoke config:set --api-key <key>` first'))
          process.exit(1)
        }

        // Determine SQL service WebSocket URL
        const wsUrl = await getSqlRelayUrl()
        if (!wsUrl) {
          console.log(chalk.red('❌ SQL relay URL not configured in global settings.'))
          console.log(chalk.dim('  Set it in the admin UI: Admin > Global Settings > SQL Relay URL'))
          console.log(chalk.dim('  Or run the migration: npm run db:migrate'))
          process.exit(1)
        }
        console.log(chalk.cyan(`\n🗄️  Starting PostgreSQL tunnel for project ${projectId}`))
        console.log(chalk.dim(`   SQL service relay: ${wsUrl}\n`))

        let psqlStarted = false
        let psql: ChildProcess | null = null
        let connectionCount = 0

        // Create local TCP server
        const server = net.createServer(socket => {
          connectionCount++

          // Open WebSocket to SQL service
          const ws = new WebSocket(wsUrl, {
            headers: {
              'X-API-Key': apiKey,
              'X-Project-Id': projectId
            }
          })

          ws.binaryType = 'nodebuffer'

          // Buffer any data from psql that arrives before the WebSocket is open.
          // psql sends SSLRequest/StartupMessage immediately on TCP connect,
          // which may arrive before the WS handshake completes.
          let pendingBuffer: Buffer[] = []
          let wsOpen = false

          socket.on('data', data => {
            if (wsOpen && ws.readyState === WebSocket.OPEN) {
              ws.send(data)
            } else {
              pendingBuffer.push(data)
            }
          })

          ws.on('open', () => {
            wsOpen = true
            // Flush any buffered data from psql
            for (const buf of pendingBuffer) {
              ws.send(buf)
            }
            pendingBuffer = []
          })

          // Relay WebSocket → local TCP
          ws.on('message', (data: Buffer) => {
            if (!socket.destroyed) {
              socket.write(data)
            }
          })

          ws.on('close', (code, reason) => {
            if (!socket.destroyed) {
              socket.end()
            }
            if (code !== 1000) {
              console.log(chalk.yellow(`\n[WebSocket] Closed: ${code} ${reason?.toString() || ''}`))
            }
          })

          ws.on('error', err => {
            console.log(chalk.red(`\n[WebSocket] Error: ${err.message}`))
            if (!socket.destroyed) {
              socket.destroy()
            }
          })

          socket.on('close', () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close()
            }
            connectionCount--
            if (connectionCount === 0 && psql && !psql.killed) {
              psql.kill()
              psql = null
            }
          })

          socket.on('error', err => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close()
            }
          })
        })

        server.listen(localPort, '127.0.0.1', () => {
          console.log(chalk.green(`✅ Listening on localhost:${localPort}`))
          console.log()

          // Try to auto-start psql if available
          if (!psql) {
            psql = spawn('psql', ['-h', 'localhost', '-p', String(localPort)], {
              stdio: 'inherit',
              detached: false
            })
          }

          psql.on('error', (err: any) => {
            // psql command not found or failed to start — just continue
            // This is not an error condition, user can connect manually
            if (err.code !== 'ENOENT') {
              console.log(chalk.dim(`(psql client auto-connect skipped: ${err.message})`))
            } else {
              console.log(chalk.white(`Connect with:`))
              console.log(chalk.dim(`  psql -h localhost -p ${localPort}`))
              console.log()
              console.log(chalk.dim('Press Ctrl+C to stop'))
            }
          })

          psql.on('spawn', () => {
            psqlStarted = true
          })

          // If psql is spawned and exits, exit the program
          psql.on('close', code => {
            if (psqlStarted) {
              console.log(chalk.dim(`\npsql client exited (code: ${code})`))
              process.exit(code || 0)
            }
            psql = null
          })
        })

        server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(chalk.red(`❌ Port ${localPort} is already in use. Try --port <other>`))
          } else {
            console.log(chalk.red(`❌ Server error: ${err.message}`))
          }
          process.exit(1)
        })

        // Graceful shutdown
        process.on('SIGINT', () => {
          console.log(chalk.dim('\nShutting down...'))
          server.close()
          process.exit(0)
        })
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to start tunnel:'), error.message)
        process.exit(1)
      }
    })
}

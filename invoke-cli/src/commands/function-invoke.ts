import chalk from 'chalk'
import fs from 'fs'
import axios from 'axios'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { getExecutionUrl } from '../services/config'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:invoke')
    .description('Execute a function')
    .argument('<id>', 'Function ID or name')
    .option('--path <path>', 'Path to append to URL (e.g., /users/123)', '')
    .option('--method <method>', 'HTTP method (GET|POST|PUT|DELETE|PATCH)', 'GET')
    .option('--header <header...>', 'Custom headers (e.g., "x-api-key: xxx")', [])
    .option('--data <json>', 'JSON data to pass to the function')
    .option('--body <data>', 'Raw request body')
    .option('--file <path>', 'Path to JSON file with request data')
    .option('--timeout <ms>', 'Timeout in milliseconds', parseInt, 30000)
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)

        // Get function details to check if API key is required
        const fnData = await get(`/api/functions/${id}`)

        if (!fnData.success) {
          console.log(chalk.red('❌ ' + fnData.message))
          process.exit(1)
        }

        const fn = fnData.data

        // Prepare request data
        let requestData: any = null

        if (options.body) {
          requestData = options.body
        } else if (options.data) {
          try {
            requestData = JSON.parse(options.data)
          } catch {
            console.log(chalk.red('❌ Invalid JSON data'))
            process.exit(1)
          }
        } else if (options.file) {
          try {
            requestData = JSON.parse(fs.readFileSync(options.file, 'utf8'))
          } catch (e: any) {
            console.log(chalk.red('❌ Failed to read or parse file:'), e.message)
            process.exit(1)
          }
        }

        // Build execution URL with optional path
        const executionUrl = getExecutionUrl()
        const pathSuffix = options.path || ''
        const url = `${executionUrl}/invoke/${fn.id}${pathSuffix}`

        if (options.output !== 'json') {
          console.log(chalk.cyan(`Executing function '${fn.name}'...`))
        }

        const startTime = Date.now()

        try {
          const headers: Record<string, string> = {}

          // Add function API key if required
          if (fn.requires_api_key && fn.api_key) {
            headers['x-api-key'] = fn.api_key
          }

          // Add custom headers
          if (options.header && options.header.length > 0) {
            ;(options.header as string[]).forEach(h => {
              const [key, ...valueParts] = h.split(':')
              if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim()
              }
            })
          }

          const response = await axios({
            method: options.method,
            url,
            data: requestData,
            headers,
            timeout: options.timeout
          })

          const duration = Date.now() - startTime

          if (options.output === 'json') {
            console.log(JSON.stringify({ status: response.status, duration, data: response.data }, null, 2))
            return
          }

          console.log(chalk.green(`✅ Function executed successfully in ${duration}ms`))
          console.log(chalk.cyan('\n📤 Response:\n'))
          console.log(JSON.stringify(response.data, null, 2))
        } catch (execError: any) {
          const duration = Date.now() - startTime

          if (options.output === 'json') {
            console.log(
              JSON.stringify(
                {
                  status: execError.response?.status || 500,
                  duration,
                  error: execError.response?.data || execError.message
                },
                null,
                2
              )
            )
            return
          }

          console.log(chalk.red(`❌ Execution failed after ${duration}ms`))
          console.log(chalk.red('Error:'), execError.response?.data || execError.message)
          process.exit(1)
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to execute function:'), error.message)
        process.exit(1)
      }
    })
}

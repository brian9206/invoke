const chalk = require('chalk')
const fs = require('fs')
const api = require('../services/api-client')
const config = require('../services/config')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
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
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        // Get function details to check if API key is required
        const fnData = await api.get(`/api/functions/${id}`)

        if (!fnData.success) {
          console.log(chalk.red('❌ ' + fnData.message))
          process.exit(1)
        }

        const fn = fnData.data

        // Prepare request data
        let requestData = null

        if (options.body) {
          requestData = options.body
        } else if (options.data) {
          try {
            requestData = JSON.parse(options.data)
          } catch (e) {
            console.log(chalk.red('❌ Invalid JSON data'))
            process.exit(1)
          }
        } else if (options.file) {
          try {
            requestData = JSON.parse(fs.readFileSync(options.file, 'utf8'))
          } catch (e) {
            console.log(chalk.red('❌ Failed to read or parse file:'), e.message)
            process.exit(1)
          }
        }

        // Build execution URL with optional path
        const executionUrl = config.getExecutionUrl()
        const pathSuffix = options.path || ''
        const url = `${executionUrl}/invoke/${fn.id}${pathSuffix}`

        if (options.output !== 'json') {
          console.log(chalk.cyan(`Executing function '${fn.name}'...`))
        }

        const startTime = Date.now()

        try {
          const axios = require('axios')
          const headers = {}

          // Add function API key if required
          if (fn.requires_api_key && fn.api_key) {
            headers['x-api-key'] = fn.api_key
          }

          // Add custom headers
          if (options.header && options.header.length > 0) {
            options.header.forEach(h => {
              const [key, ...valueParts] = h.split(':')
              if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim()
              }
            })
          }

          const response = await axios({
            method: options.method,
            url: url,
            data: requestData,
            headers: headers,
            timeout: options.timeout
          })

          const duration = Date.now() - startTime

          if (options.output === 'json') {
            console.log(JSON.stringify({
              status: response.status,
              duration: duration,
              data: response.data
            }, null, 2))
            return
          }

          console.log(chalk.green(`✅ Function executed successfully in ${duration}ms`))
          console.log(chalk.cyan('\n📤 Response:\n'))
          console.log(JSON.stringify(response.data, null, 2))
        } catch (execError) {
          const duration = Date.now() - startTime

          if (options.output === 'json') {
            console.log(JSON.stringify({
              status: execError.response?.status || 500,
              duration: duration,
              error: execError.response?.data || execError.message
            }, null, 2))
            return
          }

          console.log(chalk.red(`❌ Execution failed after ${duration}ms`))
          console.log(chalk.red('Error:'), execError.response?.data || execError.message)
          process.exit(1)
        }
      } catch (error) {
        console.log(chalk.red('❌ Failed to execute function:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

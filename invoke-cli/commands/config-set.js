const chalk = require('chalk')
const config = require('../services/config')

function register(program) {
  program
    .command('config:set')
    .description('Configure API key and base URL')
    .option('--api-key <key>', 'API key for authentication')
    .option('--base-url <url>', 'Base URL for Invoke API (default: http://localhost:3000)')
    .option('--execution-url <url>', 'Execution service URL (default: http://localhost:3001)')
    .action((options) => {
      try {
        const currentConfig = config.loadConfig()

        if (options.apiKey) {
          currentConfig.apiKey = options.apiKey
        }

        if (options.baseUrl) {
          currentConfig.baseUrl = options.baseUrl
        }

        if (options.executionUrl) {
          currentConfig.executionUrl = options.executionUrl
        }

        if (!options.apiKey && !options.baseUrl && !options.executionUrl) {
          console.log(chalk.red('❌ Please provide at least one option: --api-key, --base-url, or --execution-url'))
          return
        }

        config.saveConfig(currentConfig)
        console.log(chalk.green('✅ Configuration saved successfully!'))
        console.log(chalk.cyan('\nCurrent configuration:'))
        console.log(`Config file: ${config.CONFIG_FILE}`)
        console.log(`API Key: ${currentConfig.apiKey ? '***' + currentConfig.apiKey.slice(-8) : 'Not set'}`)
        console.log(`Base URL: ${currentConfig.baseUrl || 'http://localhost:3000'}`)
        console.log(`Execution URL: ${currentConfig.executionUrl || 'http://localhost:3001'}`)
      } catch (error) {
        console.log(chalk.red('❌ Failed to save configuration:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

const chalk = require('chalk')
const config = require('../services/config')

function register(program) {
  program
    .command('config:show')
    .description('Display current configuration')
    .action(() => {
      try {
        const currentConfig = config.loadConfig()
        const apiKey = config.getApiKey()
        const baseUrl = config.getBaseUrl()
        const executionUrl = config.getExecutionUrl()

        console.log(chalk.cyan('Current configuration:'))
        console.log(`Config file: ${config.CONFIG_FILE}`)
        console.log(`API Key: ${apiKey ? 'inv_***...' + apiKey.slice(-8) : chalk.yellow('Not set')}`)
        console.log(`API Key Source: ${process.env.INVOKE_API_KEY ? 'Environment Variable' : currentConfig.apiKey ? 'Config File' : 'None'}`)
        console.log(`Base URL: ${baseUrl}`)
        console.log(`Base URL Source: ${process.env.INVOKE_BASE_URL ? 'Environment Variable' : currentConfig.baseUrl ? 'Config File' : 'Default'}`)
        console.log(`Execution URL: ${executionUrl}`)
      } catch (error) {
        console.log(chalk.red('❌ Failed to load configuration:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

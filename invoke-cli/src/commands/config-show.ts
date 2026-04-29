import chalk from 'chalk'
import type { Command } from 'commander'
import { loadConfig, getApiKey, getBaseUrl, getExecutionUrl, CONFIG_FILE } from '../services/config'

export function register(program: Command): void {
  program
    .command('config:show')
    .description('Display current configuration')
    .action(() => {
      try {
        const currentConfig = loadConfig()
        const apiKey = getApiKey()
        const baseUrl = getBaseUrl()
        const executionUrl = getExecutionUrl()

        console.log(chalk.cyan('Current configuration:'))
        console.log(`Config file: ${CONFIG_FILE}`)
        console.log(`API Key: ${apiKey ? 'inv_***...' + apiKey.slice(-8) : chalk.yellow('Not set')}`)
        console.log(
          `API Key Source: ${process.env.INVOKE_API_KEY ? 'Environment Variable' : currentConfig.apiKey ? 'Config File' : 'None'}`
        )
        console.log(`Base URL: ${baseUrl}`)
        console.log(
          `Base URL Source: ${process.env.INVOKE_BASE_URL ? 'Environment Variable' : currentConfig.baseUrl ? 'Config File' : 'Default'}`
        )
        console.log(`Execution URL: ${executionUrl}`)
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to load configuration:'), error.message)
        process.exit(1)
      }
    })
}

import chalk from 'chalk'
import type { Command } from 'commander'
import { clearConfig } from '../services/config'

export function register(program: Command): void {
  program
    .command('config:clear')
    .description('Clear all configuration')
    .action(() => {
      try {
        clearConfig()
        console.log(chalk.green('✅ Configuration cleared successfully'))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to clear configuration:'), error.message)
        process.exit(1)
      }
    })
}

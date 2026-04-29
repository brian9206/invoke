import chalk from 'chalk'
import type { Command } from 'commander'
import { put } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:retention:set')
    .description('Set function retention settings')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--type <type>', 'Retention type (time|count|none)')
    .option('--days <n>', 'Days to retain logs (for time-based)', parseInt)
    .option('--count <n>', 'Number of logs to retain (for count-based)', parseInt)
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)
        const updates: Record<string, any> = {
          log_retention_type: options.type
        }

        if (options.type === 'time') {
          if (!options.days) {
            console.log(chalk.red('❌ --days is required for time-based retention'))
            process.exit(1)
          }
          updates.log_retention_days = options.days
        } else if (options.type === 'count') {
          if (!options.count) {
            console.log(chalk.red('❌ --count is required for count-based retention'))
            process.exit(1)
          }
          updates.log_retention_count = options.count
        }

        const data = await put(`/api/functions/${id}/retention`, updates)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green('✅ Retention settings updated successfully'))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to update retention settings:'), error.message)
        process.exit(1)
      }
    })
}

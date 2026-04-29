import chalk from 'chalk'
import type { Command } from 'commander'
import { get } from '../services/api-client'

export function register(program: Command): void {
  program
    .command('function:schedule:get')
    .description('Get function schedule settings')
    .argument('<id>', 'Function ID')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        const data = await get(`/api/functions/${id}/schedule`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const schedule = data.data

        if (options.output === 'json') {
          console.log(JSON.stringify(schedule, null, 2))
          return
        }

        console.log(chalk.cyan('\n⏰ Schedule Settings:\n'))
        console.log(`Enabled: ${schedule.schedule_enabled ? 'Yes' : 'No'}`)

        if (schedule.schedule_enabled && schedule.schedule_cron) {
          console.log(`Cron Expression: ${schedule.schedule_cron}`)
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get schedule settings:'), error.message)
        process.exit(1)
      }
    })
}

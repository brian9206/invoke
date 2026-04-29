import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:logs')
    .description('View function execution logs')
    .argument('<id>', 'Function ID or name')
    .option('--status <type>', 'Filter by status (all|success|error)', 'all')
    .option('--limit <n>', 'Number of logs to retrieve', parseInt, 50)
    .option('--page <n>', 'Page number', parseInt, 1)
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)
        const params: Record<string, any> = {
          limit: options.limit,
          page: options.page
        }

        if (options.status !== 'all') {
          params.status = options.status
        }

        const data = await get(`/api/functions/${id}/logs`, params)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const logs = data.data?.logs || []
        const pagination = data.data?.pagination

        if (options.output === 'json') {
          console.log(JSON.stringify({ logs, pagination }, null, 2))
          return
        }

        if (logs.length === 0) {
          console.log(chalk.yellow('🔭 No logs found'))
          return
        }

        console.log(chalk.cyan('\n📋 Execution Logs:\n'))
        const tableData: string[][] = [['Time', 'Status', 'Duration', 'Error']]

        logs.forEach((log: any) => {
          const status = log.status_code >= 200 && log.status_code < 300 ? chalk.green('✅') : chalk.red('❌')
          const duration = log.execution_time_ms ? `${log.execution_time_ms}ms` : 'N/A'
          const error = log.error_message
            ? log.error_message.length > 40
              ? log.error_message.substring(0, 37) + '...'
              : log.error_message
            : '-'

          tableData.push([new Date(log.executed_at).toLocaleString(), status + ' ' + log.status_code, duration, error])
        })

        console.log(table(tableData))

        if (pagination) {
          console.log(
            chalk.cyan(`\nPage ${pagination.currentPage} of ${pagination.totalPages} (${pagination.totalCount} total)`)
          )
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get logs:'), error.message)
        process.exit(1)
      }
    })
}

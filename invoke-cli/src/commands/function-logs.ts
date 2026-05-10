import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'
import { formatFileSize } from '../services/file-utils'

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
        const tableData: string[][] = [['Time', 'Status', 'Duration', 'Req Size', 'Res Size', 'Client IP']]

        logs.forEach((log: any) => {
          const payload = log.payload || {}
          const statusCode = payload.response?.status ?? '-'
          const isSuccess = typeof statusCode === 'number' ? statusCode >= 200 && statusCode < 400 : true
          const statusDisplay = isSuccess ? chalk.green('✅ ' + statusCode) : chalk.red('❌ ' + statusCode)
          const duration = payload.execution_time_ms != null ? `${payload.execution_time_ms}ms` : '-'
          const reqSize = payload.request?.body?.size != null ? formatFileSize(payload.request.body.size) : '-'
          const resSize = payload.response?.body?.size != null ? formatFileSize(payload.response.body.size) : '-'
          const clientIp = payload.request?.ip || '-'

          tableData.push([
            new Date(log.executed_at).toLocaleString(),
            statusDisplay,
            duration,
            reqSize,
            resSize,
            clientIp
          ])
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

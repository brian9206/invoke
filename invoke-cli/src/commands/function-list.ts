import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveProjectId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:list')
    .description('List functions')
    .option('--project <id>', 'Filter by project ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options: any) => {
      try {
        const params: Record<string, any> = {}
        if (options.project) {
          params.project_id = await resolveProjectId(options.project)
        }

        const data = await get('/api/functions', params)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const functions = data.data || []

        if (options.output === 'json') {
          console.log(JSON.stringify(functions, null, 2))
          return
        }

        if (functions.length === 0) {
          console.log(chalk.yellow('🔭 No functions found'))
          return
        }

        console.log(chalk.cyan('\n⚡ Functions:\n'))
        const tableData: string[][] = [['ID', 'Name', 'Project', 'Active', 'Version', 'Last Execution']]

        functions.forEach((fn: any) => {
          tableData.push([
            fn.id,
            fn.name,
            fn.project_name || fn.project_id,
            fn.is_active ? '✅' : '❌',
            fn.active_version || '-',
            fn.last_execution ? new Date(fn.last_execution).toLocaleString() : 'Never'
          ])
        })

        console.log(table(tableData))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to list functions:'), error.message)
        process.exit(1)
      }
    })
}

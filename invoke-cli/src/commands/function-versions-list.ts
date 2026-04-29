import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:versions:list')
    .description('List all versions of a function')
    .argument('<id>', 'Function ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)
        const data = await get(`/api/functions/${id}/versions`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const versions = data.data || []

        if (options.output === 'json') {
          console.log(JSON.stringify(versions, null, 2))
          return
        }

        if (versions.length === 0) {
          console.log(chalk.yellow('🔭 No versions found'))
          return
        }

        console.log(chalk.cyan('\n📦 Function Versions:\n'))
        const tableData: string[][] = [['Version', 'Status', 'Size', 'Uploaded', 'Active']]

        versions.forEach((ver: any) => {
          tableData.push([
            ver.version,
            ver.deployment_status || 'ready',
            ver.file_size ? `${(ver.file_size / 1024).toFixed(2)} KB` : 'N/A',
            new Date(ver.created_at).toLocaleString(),
            ver.is_active ? '✅' : ''
          ])
        })

        console.log(table(tableData))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to list versions:'), error.message)
        process.exit(1)
      }
    })
}

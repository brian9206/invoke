import chalk from 'chalk'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:get')
    .description('Get function details')
    .argument('<id>', 'Function ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)
        const data = await get(`/api/functions/${id}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const fn = data.data

        if (options.output === 'json') {
          console.log(JSON.stringify(fn, null, 2))
          return
        }

        console.log(chalk.cyan('\n⚡ Function Details:\n'))
        console.log(`ID: ${fn.id}`)
        console.log(`Name: ${fn.name}`)
        console.log(`Description: ${fn.description || 'N/A'}`)
        console.log(`Project: ${fn.project_name || fn.project_id}`)
        console.log(`Active: ${fn.is_active ? 'Yes' : 'No'}`)
        console.log(`Requires API Key: ${fn.requires_api_key ? 'Yes' : 'No'}`)
        console.log(`Active Version: ${fn.active_version || 'None'}`)
        console.log(`Created: ${new Date(fn.created_at).toLocaleString()}`)
        console.log(`Updated: ${fn.updated_at ? new Date(fn.updated_at).toLocaleString() : 'Never'}`)

        if (fn.last_execution) {
          console.log(`Last Execution: ${new Date(fn.last_execution).toLocaleString()}`)
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get function:'), error.message)
        process.exit(1)
      }
    })
}

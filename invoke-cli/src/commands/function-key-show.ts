import chalk from 'chalk'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:key:show')
    .description('Show function API key')
    .argument('<id>', 'Function ID or name')
    .action(async (id: string) => {
      try {
        id = await resolveFunctionId(id)
        const data = await get(`/api/functions/${id}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const fn = data.data

        console.log(chalk.cyan('\n🔑 Function API Key:\n'))
        console.log(fn.api_key || 'No API key generated')
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get function key:'), error.message)
        process.exit(1)
      }
    })
}

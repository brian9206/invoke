import chalk from 'chalk'
import inquirer from 'inquirer'
import type { Command } from 'commander'
import { delete as del } from '../services/api-client'
import { resolveFunctionId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:delete')
    .description('Delete a function')
    .argument('<id>', 'Function ID or name')
    .option('--force', 'Skip confirmation', false)
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id)

        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete function ${id}? This cannot be undone.`,
              default: false
            }
          ])

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'))
            return
          }
        }

        const data = await del(`/api/functions/${id}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green('✅ Function deleted successfully'))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to delete function:'), error.message)
        process.exit(1)
      }
    })
}

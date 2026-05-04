import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'

export function register(program: Command): void {
  program
    .command('whoami')
    .description('Display current user information')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options: any) => {
      try {
        const data = await get('/api/auth/me')

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const user = data.data

        if (options.output === 'json') {
          console.log(JSON.stringify(user, null, 2))
          return
        }

        console.log(chalk.cyan('\n👤 Current User:\n'))
        console.log(`Username: ${user.username}`)
        console.log(`Email: ${user.email}`)
        console.log(`Role: ${user.isAdmin ? 'Administrator' : 'User'}`)

        if (user.projects && user.projects.length > 0) {
          console.log(chalk.cyan('\n📁 Projects:\n'))
          const tableData: string[][] = [['Project', 'Role']]
          user.projects.forEach((p: any) => {
            tableData.push([p.name, p.role])
          })
          console.log(table(tableData))
        } else {
          console.log(chalk.yellow('\n📁 No projects assigned'))
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Authentication failed:'), error.message)
        process.exit(1)
      }
    })
}

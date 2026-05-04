import chalk from 'chalk'
import { table } from 'table'
import type { Command } from 'commander'
import { get } from '../services/api-client'

export function register(program: Command): void {
  program
    .command('project:list')
    .description('List accessible projects')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options: any) => {
      try {
        const data = await get('/api/auth/me')

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const projects = data.data.projects || []

        if (options.output === 'json') {
          console.log(JSON.stringify(projects, null, 2))
          return
        }

        if (projects.length === 0) {
          console.log(chalk.yellow('🔭 No projects found'))
          return
        }

        console.log(chalk.cyan('\n📁 Your Projects:\n'))
        const tableData: string[][] = [['ID', 'Name', 'Role', 'Description']]

        projects.forEach((p: any) => {
          tableData.push([p.id, p.name, p.role, p.description || '-'])
        })

        console.log(table(tableData))
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to list projects:'), error.message)
        process.exit(1)
      }
    })
}

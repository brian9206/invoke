import chalk from 'chalk'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveProjectId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('db:status')
    .description('Show SQL database status for a project')
    .requiredOption('--project <id>', 'Project ID, name, or @slug')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options: any) => {
      try {
        const projectId = await resolveProjectId(options.project)
        const data = await get(`/api/projects/${projectId}/database/status`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        if (options.output === 'json') {
          console.log(JSON.stringify(data.data, null, 2))
          return
        }

        const status = data.data

        if (!status.initialized) {
          console.log(chalk.yellow('⚠️  Database not initialized for this project'))
          console.log(chalk.dim('  Run `invoke db:initialize --project <id>` to create one'))
          return
        }

        console.log(chalk.cyan('\n🗄️  SQL Database Status:\n'))
        console.log(`  Database:    ${chalk.white(status.db_name)}`)
        console.log(`  Status:      ${chalk.green(status.status)}`)
        console.log(`  Admin User:  ${chalk.white(status.users.admin)}`)
        console.log(`  App User:    ${chalk.white(status.users.app)}`)
        console.log()

        const pct = status.storage.percentage
        const color = pct > 90 ? chalk.red : pct > 75 ? chalk.yellow : chalk.green
        const usedMB = (status.storage.bytes / 1024 / 1024).toFixed(1)
        const limitMB = (status.storage.limit / 1024 / 1024).toFixed(1)
        console.log(`  Storage:     ${color(`${usedMB}MB / ${limitMB}MB (${pct}%)`)}`)
        console.log()
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get database status:'), error.message)
        process.exit(1)
      }
    })
}

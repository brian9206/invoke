import chalk from 'chalk'
import type { Command } from 'commander'
import { get } from '../services/api-client'
import { resolveProjectId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('db:credentials')
    .description('Show SQL database credentials for a project')
    .requiredOption('--project <id>', 'Project ID, name, or @slug')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options: any) => {
      try {
        const projectId = await resolveProjectId(options.project)
        const data = await get(`/api/projects/${projectId}/database/credentials`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        if (options.output === 'json') {
          console.log(JSON.stringify(data.data, null, 2))
          return
        }

        const creds = data.data

        console.log(chalk.cyan('\n🔑 SQL Database Credentials:\n'))
        console.log(`  Host:        ${chalk.white(creds.host)}`)
        console.log(`  Port:        ${chalk.white(creds.port)}`)
        console.log(`  Database:    ${chalk.white(creds.database)}`)
        console.log()
        console.log(chalk.dim('  Admin User (DDL + DML):'))
        console.log(`    Username:  ${chalk.white(creds.admin_user.username)}`)
        console.log(`    Password:  ${chalk.white(creds.admin_user.password)}`)
        console.log()
        console.log(chalk.dim('  App User (DML only):'))
        console.log(`    Username:  ${chalk.white(creds.app_user.username)}`)
        console.log(`    Password:  ${chalk.white(creds.app_user.password)}`)
        console.log()

        console.log(chalk.dim('  Connection string (admin):'))
        console.log(
          `    postgresql://${creds.admin_user.username}:${creds.admin_user.password}@${creds.host}:${creds.port}/${creds.database}`
        )
        console.log()
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get credentials:'), error.message)
        process.exit(1)
      }
    })
}

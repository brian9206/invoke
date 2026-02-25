const chalk = require('chalk')
const { table } = require('table')
const api = require('../services/api-client')

function register(program) {
  program
    .command('project:list')
    .description('List accessible projects')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const data = await api.get('/api/auth/me')

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
          console.log(chalk.yellow('📭 No projects found'))
          return
        }

        console.log(chalk.cyan('\n📁 Your Projects:\n'))
        const tableData = [['ID', 'Name', 'Role', 'Description']]

        projects.forEach(p => {
          tableData.push([
            p.id,
            p.name,
            p.role,
            p.description || '-'
          ])
        })

        console.log(table(tableData))
      } catch (error) {
        console.log(chalk.red('❌ Failed to list projects:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

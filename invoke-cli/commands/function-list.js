const chalk = require('chalk')
const { table } = require('table')
const api = require('../services/api-client')
const { resolveProjectId } = require('../services/helpers')

function register(program) {
  program
    .command('function:list')
    .description('List functions')
    .option('--project <id>', 'Filter by project ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const params = {}
        if (options.project) {
          params.project_id = await resolveProjectId(options.project)
        }

        const data = await api.get('/api/functions', { params })

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
          console.log(chalk.yellow('📭 No functions found'))
          return
        }

        console.log(chalk.cyan('\n⚡ Functions:\n'))
        const tableData = [['ID', 'Name', 'Project', 'Active', 'Version', 'Last Execution']]

        functions.forEach(fn => {
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
      } catch (error) {
        console.log(chalk.red('❌ Failed to list functions:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

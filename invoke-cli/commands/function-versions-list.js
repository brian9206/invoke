const chalk = require('chalk')
const { table } = require('table')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:versions:list')
    .description('List all versions of a function')
    .argument('<id>', 'Function ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.get(`/api/functions/${id}/versions`)

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
          console.log(chalk.yellow('📭 No versions found'))
          return
        }

        console.log(chalk.cyan('\n📦 Function Versions:\n'))
        const tableData = [['Version', 'Status', 'Size', 'Uploaded', 'Active']]

        versions.forEach(ver => {
          tableData.push([
            ver.version,
            ver.deployment_status || 'ready',
            ver.file_size ? `${(ver.file_size / 1024).toFixed(2)} KB` : 'N/A',
            new Date(ver.created_at).toLocaleString(),
            ver.is_active ? '✅' : ''
          ])
        })

        console.log(table(tableData))
      } catch (error) {
        console.log(chalk.red('❌ Failed to list versions:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:retention:set')
    .description('Set function retention settings')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--type <type>', 'Retention type (time|count|none)')
    .option('--days <n>', 'Days to retain logs (for time-based)', parseInt)
    .option('--count <n>', 'Number of logs to retain (for count-based)', parseInt)
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        const updates = {
          log_retention_type: options.type
        }

        if (options.type === 'time') {
          if (!options.days) {
            console.log(chalk.red('❌ --days is required for time-based retention'))
            process.exit(1)
          }
          updates.log_retention_days = options.days
        } else if (options.type === 'count') {
          if (!options.count) {
            console.log(chalk.red('❌ --count is required for count-based retention'))
            process.exit(1)
          }
          updates.log_retention_count = options.count
        }

        const data = await api.put(`/api/functions/${id}/retention`, updates)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green('✅ Retention settings updated successfully'))
      } catch (error) {
        console.log(chalk.red('❌ Failed to update retention settings:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

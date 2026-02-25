const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:update')
    .description('Update function metadata')
    .argument('<id>', 'Function ID or name')
    .option('--name <name>', 'New function name')
    .option('--description <text>', 'New description')
    .option('--active <value>', 'Set active status (true|false)')
    .option('--requires-api-key <value>', 'Require API key (true|false)')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        const updates = {}

        if (options.name) updates.name = options.name
        if (options.description !== undefined) updates.description = options.description
        if (options.active !== undefined) updates.is_active = options.active === 'true'
        if (options.requiresApiKey !== undefined) updates.requires_api_key = options.requiresApiKey === 'true'

        if (Object.keys(updates).length === 0) {
          console.log(chalk.red('❌ Please provide at least one update option'))
          process.exit(1)
        }

        const data = await api.put(`/api/functions/${id}`, updates)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        if (options.output === 'json') {
          console.log(JSON.stringify(data.data, null, 2))
        } else {
          console.log(chalk.green('✅ Function updated successfully'))
        }
      } catch (error) {
        console.log(chalk.red('❌ Failed to update function:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

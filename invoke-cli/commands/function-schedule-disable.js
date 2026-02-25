const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:schedule:disable')
    .description('Disable function schedule')
    .argument('<id>', 'Function ID or name')
    .action(async (id) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.put(`/api/functions/${id}/schedule`, {
          schedule_enabled: false
        })

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green('✅ Schedule disabled successfully'))
      } catch (error) {
        console.log(chalk.red('❌ Failed to disable schedule:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

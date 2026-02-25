const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:schedule:set')
    .description('Set function schedule')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--cron <expression>', 'Cron expression')
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.put(`/api/functions/${id}/schedule`, {
          schedule_enabled: true,
          schedule_cron: options.cron
        })

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green(`✅ Schedule set to: ${options.cron}`))
      } catch (error) {
        console.log(chalk.red('❌ Failed to set schedule:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

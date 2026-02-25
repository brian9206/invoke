const chalk = require('chalk')
const api = require('../services/api-client')

function register(program) {
  program
    .command('function:schedule:get')
    .description('Get function schedule settings')
    .argument('<id>', 'Function ID')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id, options) => {
      try {
        const data = await api.get(`/api/functions/${id}/schedule`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const schedule = data.data

        if (options.output === 'json') {
          console.log(JSON.stringify(schedule, null, 2))
          return
        }

        console.log(chalk.cyan('\n⏰ Schedule Settings:\n'))
        console.log(`Enabled: ${schedule.schedule_enabled ? 'Yes' : 'No'}`)

        if (schedule.schedule_enabled && schedule.schedule_cron) {
          console.log(`Cron Expression: ${schedule.schedule_cron}`)
        }
      } catch (error) {
        console.log(chalk.red('❌ Failed to get schedule settings:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

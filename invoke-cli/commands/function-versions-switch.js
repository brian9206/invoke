const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:versions:switch')
    .description('Switch active version')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--ver <number>', 'Version number to switch to', parseInt)
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.post(`/api/functions/${id}/switch-version`, {
          version_number: options.ver
        })

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green(`✅ Switched to version ${options.ver}`))
      } catch (error) {
        console.log(chalk.red('❌ Failed to switch version:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

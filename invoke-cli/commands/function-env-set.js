const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:env:set')
    .description('Set an environment variable')
    .argument('<id>', 'Function ID or name')
    .argument('<key>', 'Variable key')
    .argument('<value>', 'Variable value')
    .action(async (id, key, value) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.post(`/api/functions/${id}/environment-variables`, {
          key,
          value
        })

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green(`✅ Environment variable '${key}' set successfully`))
      } catch (error) {
        console.log(chalk.red('❌ Failed to set environment variable:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

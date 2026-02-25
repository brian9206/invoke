const chalk = require('chalk')
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:key:show')
    .description('Show function API key')
    .argument('<id>', 'Function ID or name')
    .action(async (id) => {
      try {
        id = await resolveFunctionId(id)
        const data = await api.get(`/api/functions/${id}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const fn = data.data

        console.log(chalk.cyan('\n🔑 Function API Key:\n'))
        console.log(fn.api_key || 'No API key generated')
      } catch (error) {
        console.log(chalk.red('❌ Failed to get function key:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

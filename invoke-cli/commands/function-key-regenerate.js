const chalk = require('chalk')
const inquirer = require('inquirer').default
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:key:regenerate')
    .description('Regenerate function API key')
    .argument('<id>', 'Function ID or name')
    .option('--force', 'Skip confirmation', false)
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'Are you sure? This will invalidate the existing API key.',
              default: false
            }
          ])

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'))
            return
          }
        }

        const data = await api.post(`/api/functions/${id}/regenerate-key`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green('✅ API key regenerated successfully'))
        console.log(chalk.cyan('\n🔑 New API Key:\n'))
        console.log(data.data.api_key)
      } catch (error) {
        console.log(chalk.red('❌ Failed to regenerate key:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

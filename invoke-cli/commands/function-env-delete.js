const chalk = require('chalk')
const inquirer = require('inquirer').default
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:env:delete')
    .description('Delete an environment variable')
    .argument('<id>', 'Function ID or name')
    .argument('<key>', 'Variable key')
    .option('--force', 'Skip confirmation', false)
    .action(async (id, key, options) => {
      try {
        id = await resolveFunctionId(id)
        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete environment variable '${key}'?`,
              default: false
            }
          ])

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'))
            return
          }
        }

        const data = await api.del(`/api/functions/${id}/environment-variables/${key}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green(`✅ Environment variable '${key}' deleted successfully`))
      } catch (error) {
        console.log(chalk.red('❌ Failed to delete environment variable:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

const chalk = require('chalk')
const inquirer = require('inquirer').default
const api = require('../services/api-client')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
  program
    .command('function:versions:delete')
    .description('Delete a version')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--ver <number>', 'Version number to delete', parseInt)
    .option('--force', 'Skip confirmation', false)
    .action(async (id, options) => {
      try {
        id = await resolveFunctionId(id)
        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete version ${options.ver}? This cannot be undone.`,
              default: false
            }
          ])

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'))
            return
          }
        }

        const data = await api.del(`/api/functions/${id}/versions/${options.ver}`)

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        console.log(chalk.green(`✅ Version ${options.ver} deleted successfully`))
      } catch (error) {
        console.log(chalk.red('❌ Failed to delete version:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

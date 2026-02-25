const chalk = require('chalk')
const config = require('../services/config')

function register(program) {
  program
    .command('config:clear')
    .description('Clear all configuration')
    .action(() => {
      try {
        config.clearConfig()
        console.log(chalk.green('✅ Configuration cleared successfully'))
      } catch (error) {
        console.log(chalk.red('❌ Failed to clear configuration:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

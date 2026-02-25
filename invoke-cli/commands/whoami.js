const chalk = require('chalk')
const { table } = require('table')
const api = require('../services/api-client')

function register(program) {
  program
    .command('whoami')
    .description('Display current user information')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const data = await api.get('/api/auth/me')

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message))
          process.exit(1)
        }

        const user = data.data

        if (options.output === 'json') {
          console.log(JSON.stringify(user, null, 2))
          return
        }

        console.log(chalk.cyan('\n👤 Current User:\n'))
        console.log(`Username: ${user.username}`)
        console.log(`Email: ${user.email}`)
        console.log(`Role: ${user.isAdmin ? 'Administrator' : 'User'}`)

        if (user.projects && user.projects.length > 0) {
          console.log(chalk.cyan('\n📁 Projects:\n'))
          const tableData = [['Project', 'Role']]
          user.projects.forEach(p => {
            tableData.push([p.name, p.role])
          })
          console.log(table(tableData))
        } else {
          console.log(chalk.yellow('\n📁 No projects assigned'))
        }
      } catch (error) {
        console.log(chalk.red('❌ Authentication failed:'), error.message)
        process.exit(1)
      }
    })
}

module.exports = { register }

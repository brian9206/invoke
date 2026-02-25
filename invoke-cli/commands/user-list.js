const chalk = require('chalk')
const { table } = require('table')
const database = require('../services/database')

function register(program) {
  program
    .command('user:list')
    .description('List all admin users')
    .action(async () => {
      try {
        await database.connect()

        const result = await database.query(`
          SELECT id, username, email, is_admin, created_at, last_login
          FROM users
          ORDER BY created_at DESC
        `)

        if (result.rows.length === 0) {
          console.log(chalk.yellow('📭 No users found'))
          return
        }

        console.log(chalk.cyan('\n👥 Admin Users:\n'))

        const tableData = [
          ['ID', 'Username', 'Email', 'Admin', 'Created', 'Last Login']
        ]

        result.rows.forEach(user => {
          tableData.push([
            user.id.toString(),
            user.username,
            user.email,
            user.is_admin ? '✅' : '❌',
            new Date(user.created_at).toLocaleDateString(),
            user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'
          ])
        })

        console.log(table(tableData))
      } catch (error) {
        console.log(chalk.red('❌ Failed to list users:'), error.message)
        process.exit(1)
      } finally {
        await database.close()
      }
    })
}

module.exports = { register }

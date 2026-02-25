const chalk = require('chalk')
const inquirer = require('inquirer').default
const database = require('../services/database')

function register(program) {
  program
    .command('user:delete')
    .description('Delete an admin user')
    .action(async () => {
      try {
        await database.connect()

        // First, list users to choose from
        const users = await database.query('SELECT id, username, email FROM users ORDER BY username')

        if (users.rows.length === 0) {
          console.log(chalk.yellow('📭 No users found'))
          return
        }

        const choices = users.rows.map(user => ({
          name: `${user.username} (${user.email})`,
          value: user.id
        }))

        const { userId, confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'userId',
            message: 'Select user to delete:',
            choices
          },
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure? This action cannot be undone.',
            default: false
          }
        ])

        if (!confirmed) {
          console.log(chalk.yellow('❌ Operation cancelled'))
          return
        }

        // Delete user
        await database.query('DELETE FROM users WHERE id = $1', [userId])

        console.log(chalk.green('✅ User deleted successfully'))
      } catch (error) {
        console.log(chalk.red('❌ Failed to delete user:'), error.message)
        process.exit(1)
      } finally {
        await database.close()
      }
    })
}

module.exports = { register }

const chalk = require('chalk')
const inquirer = require('inquirer').default
const { Op } = require('sequelize')
const zxcvbn = require('zxcvbn')
const { table } = require('table')
const database = require('../services/database')
const { hashPassword } = require('../services/utils')

function register(program) {
  program
    .command('user:create')
    .description('Create a new user (admin or regular)')
    .action(async () => {
      try {
        const { User } = database.models

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Enter username:',
            validate: (input) => input.length >= 3 || 'Username must be at least 3 characters'
          },
          {
            type: 'input',
            name: 'email',
            message: 'Enter email:',
            validate: (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Invalid email format'
          },
          {
            type: 'password',
            name: 'password',
            message: 'Enter password:',
            validate: (input) => {
              if (input.length < 8) {
                return 'Password must be at least 8 characters'
              }
              const result = zxcvbn(input)
              if (result.score < 3) {
                const feedback = result.feedback.warning ||
                  (result.feedback.suggestions.length > 0
                    ? result.feedback.suggestions[0]
                    : 'Password is too weak. Use a longer password with a mix of characters.')
                return `Password is too weak (score: ${result.score}/4). ${feedback}`
              }
              return true
            }
          },
          {
            type: 'confirm',
            name: 'isAdmin',
            message: 'Should this user be an admin?',
            default: false
          }
        ])

        // Check if user already exists
        const existingUser = await User.findOne({
          where: { [Op.or]: [{ username: answers.username }, { email: answers.email }] },
          attributes: ['id']
        })

        if (!!existingUser) {
          console.log(chalk.red('❌ User with this username or email already exists'))
          return
        }

        const hashedPassword = await hashPassword(answers.password)

        const user = await User.create({
          username: answers.username,
          email: answers.email,
          password_hash: hashedPassword,
          is_admin: answers.isAdmin
        })

        console.log(chalk.green('✅ User created successfully!'))
        console.log('')
        console.log(chalk.cyan('User Details:'))
        console.log(`ID: ${user.id}`)
        console.log(`Username: ${user.username}`)
        console.log(`Email: ${user.email}`)
        console.log(`Admin: ${user.is_admin ? 'Yes' : 'No'}`)
        console.log(`Created: ${new Date(user.created_at).toLocaleString()}`)
      } catch (error) {
        console.log(chalk.red('❌ Failed to create user:'), error.message)
        process.exit(1)
      } finally {
        await database.close()
      }
    })
}

module.exports = { register }

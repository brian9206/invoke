#!/usr/bin/env node

const { program } = require('commander')
const inquirer = require('inquirer').default;
const chalk = require('chalk')
const { table } = require('table')
const zxcvbn = require('zxcvbn')
require('dotenv').config()

const database = require('./services/database')
const { hashPassword, generateApiKey, hashApiKey } = require('./services/utils')

/**
 * Invoke CLI - Command Line Interface for Invoke Administration
 * 
 * Features:
 * - Register new admin accounts
 * - List existing accounts
 * - Generate API keys for functions
 * - Manage function access
 */

program
  .name('invoke-cli')
  .description('CLI tool for managing Invoke admin accounts and API keys')
  .version('1.0.0')

// User management commands
program
  .command('user:create')
  .description('Create a new user (admin or regular)')
  .action(async () => {
    try {
      await database.connect()
      
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
      const existingUser = await database.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [answers.username, answers.email]
      )

      if (existingUser.rows.length > 0) {
        console.log(chalk.red('❌ User with this username or email already exists'))
        return
      }

      const hashedPassword = await hashPassword(answers.password)

      const result = await database.query(`
        INSERT INTO users (username, email, password_hash, is_admin)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, is_admin, created_at
      `, [answers.username, answers.email, hashedPassword, answers.isAdmin])

      const user = result.rows[0]

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

// Database management commands
program
  .command('db:status')
  .description('Check database connection and show statistics')
  .action(async () => {
    try {
      console.log(chalk.cyan('🔍 Checking database connection...'))
      
      await database.connect()
      console.log(chalk.green('✅ Database connected successfully'))
      
      // Get statistics
      const stats = await Promise.all([
        database.query('SELECT COUNT(*) as count FROM users'),
        database.query('SELECT COUNT(*) as count FROM functions WHERE is_active = true'),
        database.query('SELECT COUNT(*) as count FROM execution_logs WHERE executed_at > NOW() - INTERVAL \'1 day\'')
      ])

      console.log('')
      console.log(chalk.cyan('📊 Database Statistics:'))
      console.log(`Users: ${stats[0].rows[0].count}`)
      console.log(`Active Functions: ${stats[1].rows[0].count}`)
      console.log(`Executions (24h): ${stats[2].rows[0].count}`)

    } catch (error) {
      console.log(chalk.red('❌ Database connection failed:'), error.message)
      process.exit(1)
    } finally {
      await database.close()
    }
  })

// Parse command line arguments
program.parse()

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
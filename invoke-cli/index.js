#!/usr/bin/env node

const { program } = require('commander')
const inquirer = require('inquirer').default;
const chalk = require('chalk')
const { table } = require('table')
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
          validate: (input) => input.length >= 6 || 'Password must be at least 6 characters'
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

// Project management commands
program
  .command('project:create')
  .description('Create a new project')
  .action(async () => {
    try {
      await database.connect()
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter project name:',
          validate: (input) => input.length >= 3 || 'Project name must be at least 3 characters'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter project description (optional):',
        }
      ])

      // Check if project already exists
      const existingProject = await database.query(
        'SELECT id FROM projects WHERE name = $1',
        [answers.name]
      )

      if (existingProject.rows.length > 0) {
        console.log(chalk.red('❌ Project with this name already exists'))
        return
      }

      const result = await database.query(`
        INSERT INTO projects (name, description)
        VALUES ($1, $2)
        RETURNING id, name, description, created_at
      `, [answers.name, answers.description || null])

      const project = result.rows[0]

      console.log(chalk.green('✅ Project created successfully!'))
      console.log('')
      console.log(chalk.cyan('Project Details:'))
      console.log(`ID: ${project.id}`)
      console.log(`Name: ${project.name}`)
      console.log(`Description: ${project.description || 'None'}`)
      console.log(`Created: ${new Date(project.created_at).toLocaleString()}`)

    } catch (error) {
      console.log(chalk.red('❌ Failed to create project:'), error.message)
      process.exit(1)
    } finally {
      await database.close()
    }
  })

program
  .command('project:list')
  .description('List all projects with member and function counts')
  .action(async () => {
    try {
      await database.connect()
      
      const result = await database.query(`
        SELECT 
          p.id, 
          p.name, 
          p.description, 
          p.is_active,
          p.created_at,
          COUNT(DISTINCT pm.user_id) as member_count,
          COUNT(DISTINCT f.id) as function_count
        FROM projects p
        LEFT JOIN project_memberships pm ON p.id = pm.project_id
        LEFT JOIN functions f ON p.id = f.project_id
        GROUP BY p.id, p.name, p.description, p.is_active, p.created_at
        ORDER BY p.created_at DESC
      `)

      if (result.rows.length === 0) {
        console.log(chalk.yellow('📭 No projects found'))
        return
      }

      console.log(chalk.cyan('\n📁 Projects:\n'))

      const tableData = [
        ['ID', 'Name', 'Description', 'Active', 'Members', 'Functions', 'Created']
      ]

      result.rows.forEach(project => {
        tableData.push([
          project.id.substring(0, 8) + '...',
          project.name,
          (project.description || '').substring(0, 30) + (project.description && project.description.length > 30 ? '...' : ''),
          project.is_active ? '✅' : '❌',
          project.member_count.toString(),
          project.function_count.toString(),
          new Date(project.created_at).toLocaleDateString()
        ])
      })

      console.log(table(tableData))

    } catch (error) {
      console.log(chalk.red('❌ Failed to list projects:'), error.message)
      process.exit(1)
    } finally {
      await database.close()
    }
  })

program
  .command('project:assign')
  .description('Assign a user to a project with a specific role')
  .action(async () => {
    try {
      await database.connect()
      
      // Get projects
      const projects = await database.query('SELECT id, name FROM projects ORDER BY name')
      if (projects.rows.length === 0) {
        console.log(chalk.yellow('📭 No projects found. Create a project first.'))
        return
      }

      // Get users  
      const users = await database.query('SELECT id, username, email FROM users ORDER BY username')
      if (users.rows.length === 0) {
        console.log(chalk.yellow('📭 No users found. Create a user first.'))
        return
      }

      const projectChoices = projects.rows.map(project => ({
        name: project.name,
        value: project.id
      }))

      const userChoices = users.rows.map(user => ({
        name: `${user.username} (${user.email})`,
        value: user.id
      }))

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'projectId',
          message: 'Select project:',
          choices: projectChoices
        },
        {
          type: 'list',
          name: 'userId',
          message: 'Select user:',
          choices: userChoices
        },
        {
          type: 'list',
          name: 'role',
          message: 'Select role:',
          choices: [
            { name: 'Owner (full access)', value: 'owner' },
            { name: 'Developer', value: 'developer' }
          ]
        }
      ])

      // Check if membership already exists
      const existingMembership = await database.query(
        'SELECT id FROM project_memberships WHERE project_id = $1 AND user_id = $2',
        [answers.projectId, answers.userId]
      )

      if (existingMembership.rows.length > 0) {
        console.log(chalk.red('❌ User is already a member of this project'))
        return
      }

      // Add membership
      await database.query(`
        INSERT INTO project_memberships (project_id, user_id, role)
        VALUES ($1, $2, $3)
      `, [answers.projectId, answers.userId, answers.role])

      console.log(chalk.green('✅ User assigned to project successfully!'))

    } catch (error) {
      console.log(chalk.red('❌ Failed to assign user to project:'), error.message)
      process.exit(1)
    } finally {
      await database.close()
    }
  })

program
  .command('project:members')
  .description('List members of a project')
  .action(async () => {
    try {
      await database.connect()
      
      // Get projects
      const projects = await database.query('SELECT id, name FROM projects ORDER BY name')
      if (projects.rows.length === 0) {
        console.log(chalk.yellow('📭 No projects found'))
        return
      }

      const projectChoices = projects.rows.map(project => ({
        name: project.name,
        value: project.id
      }))

      const { projectId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'projectId',
          message: 'Select project:',
          choices: projectChoices
        }
      ])

      const result = await database.query(`
        SELECT 
          u.username,
          u.email,
          pm.role,
          pm.created_at
        FROM project_memberships pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1
        ORDER BY pm.created_at ASC
      `, [projectId])

      if (result.rows.length === 0) {
        console.log(chalk.yellow('📭 No members found for this project'))
        return
      }

      const projectName = projects.rows.find(p => p.id === projectId).name
      console.log(chalk.cyan(`\n👥 Members of "${projectName}":\n`))

      const tableData = [
        ['Username', 'Email', 'Role', 'Added']
      ]

      result.rows.forEach(member => {
        tableData.push([
          member.username,
          member.email,
          member.role.charAt(0).toUpperCase() + member.role.slice(1),
          new Date(member.created_at).toLocaleDateString()
        ])
      })

      console.log(table(tableData))

    } catch (error) {
      console.log(chalk.red('❌ Failed to list project members:'), error.message)
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
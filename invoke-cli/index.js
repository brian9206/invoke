#!/usr/bin/env node

const { program } = require('commander')
const inquirer = require('inquirer').default;
const chalk = require('chalk')
const { table } = require('table')
const zxcvbn = require('zxcvbn')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const database = require('./services/database')
const { hashPassword, generateApiKey, hashApiKey } = require('./services/utils')
const config = require('./services/config')
const api = require('./services/api-client')
const fileUtils = require('./services/file-utils')

/**
 * Helper function to resolve function name or ID to UUID
 * @param {string} nameOrId - Function name or UUID
 * @returns {Promise<string>} - Resolved UUID
 */
async function resolveFunctionId(nameOrId) {
  // UUID regex pattern (8-4-4-4-12 format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  
  // If it's already a UUID, return it as-is
  if (uuidPattern.test(nameOrId)) {
    return nameOrId
  }
  
  // Otherwise, lookup by name
  try {
    const data = await api.get('/api/functions')
    
    if (!data.success) {
      throw new Error('Failed to fetch functions: ' + data.message)
    }
    
    const functions = data.data
    const match = functions.find(fn => fn.name === nameOrId)
    
    if (!match) {
      throw new Error(`Function not found with name: "${nameOrId}"`)
    }
    
    return match.id
  } catch (error) {
    throw new Error(`Failed to resolve function: ${error.message}`)
  }
}

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
  .name('invoke')
  .description('Invoke Platform Command Line Interface')
  .version('1.0.0')

// ========================================
// Configuration Commands
// ========================================

program
  .command('config:set')
  .description('Configure API key and base URL')
  .option('--api-key <key>', 'API key for authentication')
  .option('--base-url <url>', 'Base URL for Invoke API (default: http://localhost:3000)')
  .option('--execution-url <url>', 'Execution service URL (default: http://localhost:3001)')
  .action((options) => {
    try {
      const currentConfig = config.loadConfig()
      
      if (options.apiKey) {
        currentConfig.apiKey = options.apiKey
      }
      
      if (options.baseUrl) {
        currentConfig.baseUrl = options.baseUrl
      }
      
      if (options.executionUrl) {
        currentConfig.executionUrl = options.executionUrl
      }
      
      if (!options.apiKey && !options.baseUrl && !options.executionUrl) {
        console.log(chalk.red('❌ Please provide at least one option: --api-key, --base-url, or --execution-url'))
        return
      }
      
      config.saveConfig(currentConfig)
      console.log(chalk.green('✅ Configuration saved successfully!'))
      console.log(chalk.cyan('\nCurrent configuration:'))
      console.log(`Config file: ${config.CONFIG_FILE}`)
      console.log(`API Key: ${currentConfig.apiKey ? '***' + currentConfig.apiKey.slice(-8) : 'Not set'}`)
      console.log(`Base URL: ${currentConfig.baseUrl || 'http://localhost:3000'}`)
      console.log(`Execution URL: ${currentConfig.executionUrl || 'http://localhost:3001'}`)
    } catch (error) {
      console.log(chalk.red('❌ Failed to save configuration:'), error.message)
      process.exit(1)
    }
  })

program
  .command('config:show')
  .description('Display current configuration')
  .action(() => {
    try {
      const currentConfig = config.loadConfig()
      const apiKey = config.getApiKey()
      const baseUrl = config.getBaseUrl()
      const executionUrl = config.getExecutionUrl()
      
      console.log(chalk.cyan('Current configuration:'))
      console.log(`Config file: ${config.CONFIG_FILE}`)
      console.log(`API Key: ${apiKey ? 'inv_***...' + apiKey.slice(-8) : chalk.yellow('Not set')}`)
      console.log(`API Key Source: ${process.env.INVOKE_API_KEY ? 'Environment Variable' : currentConfig.apiKey ? 'Config File' : 'None'}`)
      console.log(`Base URL: ${baseUrl}`)
      console.log(`Base URL Source: ${process.env.INVOKE_BASE_URL ? 'Environment Variable' : currentConfig.baseUrl ? 'Config File' : 'Default'}`)
      console.log(`Execution URL: ${executionUrl}`)
    } catch (error) {
      console.log(chalk.red('❌ Failed to load configuration:'), error.message)
      process.exit(1)
    }
  })

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

// ========================================
// Authentication Commands
// ========================================

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

// ========================================
// Project Commands
// ========================================

program
  .command('project:list')
  .description('List accessible projects')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    try {
      const data = await api.get('/api/auth/me')
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const projects = data.data.projects || []
      
      if (options.output === 'json') {
        console.log(JSON.stringify(projects, null, 2))
        return
      }
      
      if (projects.length === 0) {
        console.log(chalk.yellow('📭 No projects found'))
        return
      }
      
      console.log(chalk.cyan('\n📁 Your Projects:\n'))
      const tableData = [['ID', 'Name', 'Role', 'Description']]
      
      projects.forEach(p => {
        tableData.push([
          p.id,
          p.name,
          p.role,
          p.description || '-'
        ])
      })
      
      console.log(table(tableData))
    } catch (error) {
      console.log(chalk.red('❌ Failed to list projects:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function Management Commands
// ========================================

program
  .command('function:list')
  .description('List functions')
  .option('--project <id>', 'Filter by project ID')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    try {
      const params = {}
      if (options.project) {
        params.project_id = options.project
      }
      
      const data = await api.get('/api/functions', { params })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const functions = data.data || []
      
      if (options.output === 'json') {
        console.log(JSON.stringify(functions, null, 2))
        return
      }
      
      if (functions.length === 0) {
        console.log(chalk.yellow('📭 No functions found'))
        return
      }
      
      console.log(chalk.cyan('\n⚡ Functions:\n'))
      const tableData = [['ID', 'Name', 'Project', 'Active', 'Version', 'Last Execution']]
      
      functions.forEach(fn => {
        tableData.push([
          fn.id,
          fn.name,
          fn.project_name || fn.project_id,
          fn.is_active ? '✅' : '❌',
          fn.active_version || '-',
          fn.last_execution ? new Date(fn.last_execution).toLocaleString() : 'Never'
        ])
      })
      
      console.log(table(tableData))
    } catch (error) {
      console.log(chalk.red('❌ Failed to list functions:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:get')
  .description('Get function details')
  .argument('<id>', 'Function ID or name')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.get(`/api/functions/${id}`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const fn = data.data
      
      if (options.output === 'json') {
        console.log(JSON.stringify(fn, null, 2))
        return
      }
      
      console.log(chalk.cyan('\n⚡ Function Details:\n'))
      console.log(`ID: ${fn.id}`)
      console.log(`Name: ${fn.name}`)
      console.log(`Description: ${fn.description || 'N/A'}`)
      console.log(`Project: ${fn.project_name || fn.project_id}`)
      console.log(`Active: ${fn.is_active ? 'Yes' : 'No'}`)
      console.log(`Requires API Key: ${fn.requires_api_key ? 'Yes' : 'No'}`)
      console.log(`Active Version: ${fn.active_version || 'None'}`)
      console.log(`Created: ${new Date(fn.created_at).toLocaleString()}`)
      console.log(`Updated: ${fn.updated_at ? new Date(fn.updated_at).toLocaleString() : 'Never'}`)
      
      if (fn.last_execution) {
        console.log(`Last Execution: ${new Date(fn.last_execution).toLocaleString()}`)
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to get function:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:create')
  .description('Create a new function')
  .argument('<path>', 'Path to function directory or zip file')
  .requiredOption('--name <name>', 'Function name')
  .requiredOption('--project <id>', 'Project ID')
  .option('--description <text>', 'Function description')
  .option('--requires-api-key', 'Require API key for invocation', false)
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (functionPath, options) => {
    try {
      // Step 1: Create function metadata
      if (options.output !== 'json') {
        console.log(chalk.cyan('Creating function...'))
      }
      
      const createData = await api.post('/api/functions', {
        name: options.name,
        project_id: options.project,
        description: options.description || '',
        requires_api_key: options.requiresApiKey
      })
      
      if (!createData.success) {
        console.log(chalk.red('❌ ' + createData.message))
        process.exit(1)
      }
      
      const functionId = createData.data.id
      
      if (options.output !== 'json') {
        console.log(chalk.green(`✅ Function created with ID: ${functionId}`))
      }
      
      // Step 2: Upload code
      if (options.output !== 'json') {
        console.log(chalk.cyan('Uploading code...'))
      }
      
      const { filePath, cleanup } = await fileUtils.prepareUpload(functionPath)
      
      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(filePath))
        
        const uploadData = await api.post(`/api/functions/${functionId}/versions`, form, {
          headers: form.getHeaders()
        })
        
        if (!uploadData.success) {
          console.log(chalk.red('❌ Upload failed: ' + uploadData.message))
          process.exit(1)
        }
        
        const versionNumber = uploadData.data.version
        
        if (options.output !== 'json') {
          console.log(chalk.green(`✅ Code uploaded as version ${versionNumber}`))
          console.log(chalk.cyan('Activating function...'))
        }
        
        // Automatically switch to the uploaded version (matching admin UI behavior)
        const switchData = await api.post(`/api/functions/${functionId}/switch-version`, {
          version_number: versionNumber
        })
        
        if (!switchData.success) {
          if (options.output !== 'json') {
            console.log(chalk.yellow(`⚠️  Function created but activation failed: ${switchData.message}`))
          }
        }
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ ...createData.data, version: versionNumber, is_active: switchData.success }, null, 2))
        } else {
          console.log(chalk.green('✅ Function activated'))
          console.log(chalk.cyan('\n⚡ Function created successfully!\n'))
          console.log(`ID: ${functionId}`)
          console.log(`Name: ${options.name}`)
          console.log(`Version: ${versionNumber}`)
          console.log(`Status: ${switchData.success ? 'Active' : 'Inactive'}`)
        }
      } finally {
        if (cleanup) {
          cleanup()
        }
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to create function:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:update')
  .description('Update function metadata')
  .argument('<id>', 'Function ID or name')
  .option('--name <name>', 'New function name')
  .option('--description <text>', 'New description')
  .option('--active <value>', 'Set active status (true|false)')
  .option('--requires-api-key <value>', 'Require API key (true|false)')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const updates = {}
      
      if (options.name) updates.name = options.name
      if (options.description !== undefined) updates.description = options.description
      if (options.active !== undefined) updates.is_active = options.active === 'true'
      if (options.requiresApiKey !== undefined) updates.requires_api_key = options.requiresApiKey === 'true'
      
      if (Object.keys(updates).length === 0) {
        console.log(chalk.red('❌ Please provide at least one update option'))
        process.exit(1)
      }
      
      const data = await api.put(`/api/functions/${id}`, updates)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      if (options.output === 'json') {
        console.log(JSON.stringify(data.data, null, 2))
      } else {
        console.log(chalk.green('✅ Function updated successfully'))
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to update function:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:delete')
  .description('Delete a function')
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
            message: `Are you sure you want to delete function ${id}? This cannot be undone.`,
            default: false
          }
        ])
        
        if (!answers.confirmed) {
          console.log(chalk.yellow('❌ Operation cancelled'))
          return
        }
      }
      
      const data = await api.del(`/api/functions/${id}`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green('✅ Function deleted successfully'))
    } catch (error) {
      console.log(chalk.red('❌ Failed to delete function:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function Environment Variables Commands
// ========================================

program
  .command('function:env:list')
  .description('List environment variables for a function')
  .argument('<id>', 'Function ID or name')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.get(`/api/functions/${id}/environment-variables`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const envVars = data.data || []
      
      if (options.output === 'json') {
        console.log(JSON.stringify(envVars, null, 2))
        return
      }
      
      if (envVars.length === 0) {
        console.log(chalk.yellow('📭 No environment variables found'))
        return
      }
      
      console.log(chalk.cyan('\n🔧 Environment Variables:\n'))
      const tableData = [['Key', 'Value', 'Created']]
      
      envVars.forEach(env => {
        tableData.push([
          env.key,
          env.value.length > 40 ? env.value.substring(0, 37) + '...' : env.value,
          new Date(env.created_at).toLocaleString()
        ])
      })
      
      console.log(table(tableData))
    } catch (error) {
      console.log(chalk.red('❌ Failed to list environment variables:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:env:set')
  .description('Set an environment variable')
  .argument('<id>', 'Function ID or name')
  .argument('<key>', 'Variable key')
  .argument('<value>', 'Variable value')
  .action(async (id, key, value) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.post(`/api/functions/${id}/environment-variables`, {
        key,
        value
      })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green(`✅ Environment variable '${key}' set successfully`))
    } catch (error) {
      console.log(chalk.red('❌ Failed to set environment variable:'), error.message)
      process.exit(1)
    }
  })

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

// ========================================
// Function Retention Commands
// ========================================

program
  .command('function:retention:get')
  .description('Get function retention settings')
  .argument('<id>', 'Function ID')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      const data = await api.get(`/api/functions/${id}/retention`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const retention = data.data
      
      if (options.output === 'json') {
        console.log(JSON.stringify(retention, null, 2))
        return
      }
      
      console.log(chalk.cyan('\n🗂️  Retention Settings:\n'))
      console.log(`Type: ${retention.log_retention_type || 'none'}`)
      
      if (retention.log_retention_type === 'time') {
        console.log(`Days: ${retention.log_retention_days}`)
      } else if (retention.log_retention_type === 'count') {
        console.log(`Count: ${retention.log_retention_count}`)
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to get retention settings:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:retention:set')
  .description('Set function retention settings')
  .argument('<id>', 'Function ID or name')
  .requiredOption('--type <type>', 'Retention type (time|count|none)')
  .option('--days <n>', 'Days to retain logs (for time-based)', parseInt)
  .option('--count <n>', 'Number of logs to retain (for count-based)', parseInt)
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const updates = {
        log_retention_type: options.type
      }
      
      if (options.type === 'time') {
        if (!options.days) {
          console.log(chalk.red('❌ --days is required for time-based retention'))
          process.exit(1)
        }
        updates.log_retention_days = options.days
      } else if (options.type === 'count') {
        if (!options.count) {
          console.log(chalk.red('❌ --count is required for count-based retention'))
          process.exit(1)
        }
        updates.log_retention_count = options.count
      }
      
      const data = await api.put(`/api/functions/${id}/retention`, updates)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green('✅ Retention settings updated successfully'))
    } catch (error) {
      console.log(chalk.red('❌ Failed to update retention settings:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function Schedule Commands
// ========================================

program
  .command('function:schedule:get')
  .description('Get function schedule settings')
  .argument('<id>', 'Function ID')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      const data = await api.get(`/api/functions/${id}/schedule`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const schedule = data.data
      
      if (options.output === 'json') {
        console.log(JSON.stringify(schedule, null, 2))
        return
      }
      
      console.log(chalk.cyan('\n⏰ Schedule Settings:\n'))
      console.log(`Enabled: ${schedule.schedule_enabled ? 'Yes' : 'No'}`)
      
      if (schedule.schedule_enabled && schedule.schedule_cron) {
        console.log(`Cron Expression: ${schedule.schedule_cron}`)
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to get schedule settings:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:schedule:set')
  .description('Set function schedule')
  .argument('<id>', 'Function ID or name')
  .requiredOption('--cron <expression>', 'Cron expression')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.put(`/api/functions/${id}/schedule`, {
        schedule_enabled: true,
        schedule_cron: options.cron
      })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green(`✅ Schedule set to: ${options.cron}`))
    } catch (error) {
      console.log(chalk.red('❌ Failed to set schedule:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:schedule:disable')
  .description('Disable function schedule')
  .argument('<id>', 'Function ID or name')
  .action(async (id) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.put(`/api/functions/${id}/schedule`, {
        schedule_enabled: false
      })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green('✅ Schedule disabled successfully'))
    } catch (error) {
      console.log(chalk.red('❌ Failed to disable schedule:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function Version Commands
// ========================================

program
  .command('function:versions:list')
  .description('List all versions of a function')
  .argument('<id>', 'Function ID or name')
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.get(`/api/functions/${id}/versions`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const versions = data.data || []
      
      if (options.output === 'json') {
        console.log(JSON.stringify(versions, null, 2))
        return
      }
      
      if (versions.length === 0) {
        console.log(chalk.yellow('📭 No versions found'))
        return
      }
      
      console.log(chalk.cyan('\n📦 Function Versions:\n'))
      const tableData = [['Version', 'Status', 'Size', 'Uploaded', 'Active']]
      
      versions.forEach(ver => {
        tableData.push([
          ver.version,
          ver.deployment_status || 'ready',
          ver.file_size ? `${(ver.file_size / 1024).toFixed(2)} KB` : 'N/A',
          new Date(ver.created_at).toLocaleString(),
          ver.is_active ? '✅' : ''
        ])
      })
      
      console.log(table(tableData))
    } catch (error) {
      console.log(chalk.red('❌ Failed to list versions:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:versions:upload')
  .description('Upload a new version')
  .argument('<id>', 'Function ID or name')
  .argument('<path>', 'Path to function directory or zip file')
  .option('--switch', 'Automatically switch to this version after upload', false)
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, functionPath, options) => {
    try {
      id = await resolveFunctionId(id)
      if (options.output !== 'json') {
        console.log(chalk.cyan('Preparing upload...'))
      }
      
      const { filePath, cleanup } = await fileUtils.prepareUpload(functionPath)
      
      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(filePath))
        
        const data = await api.post(`/api/functions/${id}/versions`, form, {
          headers: form.getHeaders()
        })
        
        if (!data.success) {
          console.log(chalk.red('❌ Upload failed: ' + data.message))
          process.exit(1)
        }
        
        const version = data.data
        
        if (options.output !== 'json') {
          console.log(chalk.green(`✅ Version ${version.version} uploaded successfully`))
        }
        
        // Auto-switch if flag is set
        if (options.switch) {
          if (options.output !== 'json') {
            console.log(chalk.cyan('Switching to new version...'))
          }
          
          const switchData = await api.post(`/api/functions/${id}/switch-version`, {
            version_number: version.version
          })
          
          if (switchData.success) {
            if (options.output !== 'json') {
              console.log(chalk.green(`✅ Switched to version ${version.version}`))
            }
          } else {
            if (options.output !== 'json') {
              console.log(chalk.yellow(`⚠️  Upload succeeded but switch failed: ${switchData.message}`))
            }
          }
        }
        
        if (options.output === 'json') {
          console.log(JSON.stringify(version, null, 2))
        }
      } finally {
        if (cleanup) {
          cleanup()
        }
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to upload version:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:versions:switch')
  .description('Switch active version')
  .argument('<id>', 'Function ID or name')
  .requiredOption('--ver <number>', 'Version number to switch to', parseInt)
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.post(`/api/functions/${id}/switch-version`, {
        version_number: options.ver
      })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      console.log(chalk.green(`✅ Switched to version ${options.ver}`))
    } catch (error) {
      console.log(chalk.red('❌ Failed to switch version:'), error.message)
      process.exit(1)
    }
  })

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

program
  .command('function:versions:download')
  .description('Download a version')
  .argument('<id>', 'Function ID or name')
  .requiredOption('--ver <number>', 'Version number to download', parseInt)
  .option('--output <path>', 'Output path (ends with .zip to save as zip, otherwise extracts to directory)')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const outputPath = options.output || `./function-${id}-v${options.ver}`
      
      console.log(chalk.cyan('Downloading version...'))
      
      await fileUtils.handleDownload(
        `/api/functions/${id}/versions/${options.ver}/download`,
        outputPath
      )
      
      console.log(chalk.green(`✅ Downloaded to: ${outputPath}`))
    } catch (error) {
      console.log(chalk.red('❌ Failed to download version:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function Logs Commands
// ========================================

program
  .command('function:logs')
  .description('View function execution logs')
  .argument('<id>', 'Function ID or name')
  .option('--status <type>', 'Filter by status (all|success|error)', 'all')
  .option('--limit <n>', 'Number of logs to retrieve', parseInt, 50)
  .option('--page <n>', 'Page number', parseInt, 1)
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      const params = {
        limit: options.limit,
        page: options.page
      }
      
      if (options.status !== 'all') {
        params.status = options.status
      }
      
      const data = await api.get(`/api/functions/${id}/logs`, { params })
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const logs = data.data?.logs || []
      const pagination = data.data?.pagination
      
      if (options.output === 'json') {
        console.log(JSON.stringify({ logs, pagination }, null, 2))
        return
      }
      
      if (logs.length === 0) {
        console.log(chalk.yellow('📭 No logs found'))
        return
      }
      
      console.log(chalk.cyan('\n📋 Execution Logs:\n'))
      const tableData = [['Time', 'Status', 'Duration', 'Error']]
      
      logs.forEach(log => {
        const status = log.status_code >= 200 && log.status_code < 300 ? chalk.green('✅') : chalk.red('❌')
        const duration = log.execution_time_ms ? `${log.execution_time_ms}ms` : 'N/A'
        const error = log.error_message ? 
          (log.error_message.length > 40 ? log.error_message.substring(0, 37) + '...' : log.error_message) : 
          '-'
        
        tableData.push([
          new Date(log.executed_at).toLocaleString(),
          status + ' ' + log.status_code,
          duration,
          error
        ])
      })
      
      console.log(table(tableData))
      
      if (pagination) {
        console.log(chalk.cyan(`\nPage ${pagination.currentPage} of ${pagination.totalPages} (${pagination.totalCount} total)`))
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to get logs:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Function API Key Commands
// ========================================

program
  .command('function:key:show')
  .description('Show function API key')
  .argument('<id>', 'Function ID or name')
  .action(async (id) => {
    try {
      id = await resolveFunctionId(id)
      const data = await api.get(`/api/functions/${id}`)
      
      if (!data.success) {
        console.log(chalk.red('❌ ' + data.message))
        process.exit(1)
      }
      
      const fn = data.data
      
      console.log(chalk.cyan('\n🔑 Function API Key:\n'))
      console.log(fn.api_key || 'No API key generated')
    } catch (error) {
      console.log(chalk.red('❌ Failed to get function key:'), error.message)
      process.exit(1)
    }
  })

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

// ========================================
// Function Execution Commands
// ========================================

program
  .command('function:invoke')
  .description('Execute a function')
  .argument('<id>', 'Function ID or name')
  .option('--path <path>', 'Path to append to URL (e.g., /users/123)', '')
  .option('--method <method>', 'HTTP method (GET|POST|PUT|DELETE|PATCH)', 'GET')
  .option('--header <header...>', 'Custom headers (e.g., "x-api-key: xxx")', [])
  .option('--data <json>', 'JSON data to pass to the function')
  .option('--body <data>', 'Raw request body')
  .option('--file <path>', 'Path to JSON file with request data')
  .option('--timeout <ms>', 'Timeout in milliseconds', parseInt, 30000)
  .option('--output <format>', 'Output format (table|json)', 'table')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      // Get function details to check if API key is required
      const fnData = await api.get(`/api/functions/${id}`)
      
      if (!fnData.success) {
        console.log(chalk.red('❌ ' + fnData.message))
        process.exit(1)
      }
      
      const fn = fnData.data
      
      // Prepare request data
      let requestData = null
      
      if (options.body) {
        // Raw body takes precedence
        requestData = options.body
      } else if (options.data) {
        try {
          requestData = JSON.parse(options.data)
        } catch (e) {
          console.log(chalk.red('❌ Invalid JSON data'))
          process.exit(1)
        }
      } else if (options.file) {
        try {
          requestData = JSON.parse(fs.readFileSync(options.file, 'utf8'))
        } catch (e) {
          console.log(chalk.red('❌ Failed to read or parse file:'), e.message)
          process.exit(1)
        }
      }
      
      // Build execution URL with optional path
      const executionUrl = config.getExecutionUrl()
      const pathSuffix = options.path || ''
      const url = `${executionUrl}/invoke/${fn.id}${pathSuffix}`
      
      if (options.output !== 'json') {
        console.log(chalk.cyan(`Executing function '${fn.name}'...`))
      }
      
      const startTime = Date.now()
      
      try {
        // Make direct HTTP request to execution service
        const axios = require('axios')
        const headers = {}
        
        // Add function API key if required
        if (fn.requires_api_key && fn.api_key) {
          headers['x-api-key'] = fn.api_key
        }
        
        // Add custom headers
        if (options.header && options.header.length > 0) {
          options.header.forEach(h => {
            const [key, ...valueParts] = h.split(':')
            if (key && valueParts.length > 0) {
              headers[key.trim()] = valueParts.join(':').trim()
            }
          })
        }
        
        const response = await axios({
          method: options.method,
          url: url,
          data: requestData,
          headers: headers,
          timeout: options.timeout
        })
        
        const duration = Date.now() - startTime
        
        if (options.output === 'json') {
          console.log(JSON.stringify({
            status: response.status,
            duration: duration,
            data: response.data
          }, null, 2))
          return
        }
        
        console.log(chalk.green(`✅ Function executed successfully in ${duration}ms`))
        console.log(chalk.cyan('\n📤 Response:\n'))
        console.log(JSON.stringify(response.data, null, 2))
        
      } catch (execError) {
        const duration = Date.now() - startTime
        
        if (options.output === 'json') {
          console.log(JSON.stringify({
            status: execError.response?.status || 500,
            duration: duration,
            error: execError.response?.data || execError.message
          }, null, 2))
          return
        }
        
        console.log(chalk.red(`❌ Execution failed after ${duration}ms`))
        console.log(chalk.red('Error:'), execError.response?.data || execError.message)
        process.exit(1)
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to execute function:'), error.message)
      process.exit(1)
    }
  })

program
  .command('function:test')
  .description('Test a function with enhanced output')
  .argument('<id>', 'Function ID or name')
  .option('--path <path>', 'Path to append to URL (e.g., /users/123)', '')
  .option('--method <method>', 'HTTP method (GET|POST|PUT|DELETE|PATCH)', 'POST')
  .option('--header <header...>', 'Custom headers (e.g., "x-api-key: xxx")', [])
  .option('--data <json>', 'JSON data to pass to the function')
  .option('--body <data>', 'Raw request body')
  .option('--file <path>', 'Path to JSON file with request data')
  .action(async (id, options) => {
    try {
      id = await resolveFunctionId(id)
      // Get function details
      const fnData = await api.get(`/api/functions/${id}`)
      
      if (!fnData.success) {
        console.log(chalk.red('❌ ' + fnData.message))
        process.exit(1)
      }
      
      const fn = fnData.data
      
      console.log(chalk.cyan('\n🧪 Testing Function:\n'))
      console.log(`Name: ${fn.name}`)
      console.log(`ID: ${fn.id}`)
      console.log(`Active: ${fn.is_active ? 'Yes' : 'No'}`)
      console.log(`Version: ${fn.active_version || 'None'}`)
      console.log(`Requires API Key: ${fn.requires_api_key ? 'Yes' : 'No'}`)
      
      if (!fn.is_active) {
        console.log(chalk.yellow('\n⚠️  Warning: Function is not active'))
      }
      
      if (!fn.active_version) {
        console.log(chalk.red('\n❌ Error: No active version. Upload code first.'))
        process.exit(1)
      }
      
      // Prepare request data
      let requestData = null
      
      if (options.body) {
        // Raw body takes precedence
        requestData = options.body
      } else if (options.data) {
        try {
          requestData = JSON.parse(options.data)
        } catch (e) {
          console.log(chalk.red('❌ Invalid JSON data'))
          process.exit(1)
        }
      } else if (options.file) {
        try {
          requestData = JSON.parse(fs.readFileSync(options.file, 'utf8'))
        } catch (e) {
          console.log(chalk.red('❌ Failed to read or parse file:'), e.message)
          process.exit(1)
        }
      }
      
      // Build execution URL with optional path
      const executionUrl = config.getExecutionUrl()
      const pathSuffix = options.path || ''
      const url = `${executionUrl}/invoke/${fn.id}${pathSuffix}`
      
      console.log(chalk.cyan('\n⚡ Executing...\n'))
      
      const startTime = Date.now()
      
      try {
        const axios = require('axios')
        const headers = {}
        
        if (fn.requires_api_key && fn.api_key) {
          headers['x-api-key'] = fn.api_key
        }
        
        // Add custom headers
        if (options.header && options.header.length > 0) {
          options.header.forEach(h => {
            const [key, ...valueParts] = h.split(':')
            if (key && valueParts.length > 0) {
              headers[key.trim()] = valueParts.join(':').trim()
            }
          })
        }
        
        const response = await axios({
          method: options.method || 'POST',
          url: url,
          data: requestData,
          headers: headers,
          timeout: 30000
        })
        
        const duration = Date.now() - startTime
        
        console.log(chalk.green(`✅ Success in ${duration}ms`))
        console.log(chalk.cyan('\n📊 Response:\n'))
        console.log(JSON.stringify(response.data, null, 2))
        
        // Fetch recent logs
        console.log(chalk.cyan('\n📋 Recent Logs:\n'))
        
        const logsData = await api.get(`/api/functions/${id}/logs`, { 
          params: { limit: 5, page: 1 } 
        })
        
        if (logsData.success && logsData.data.length > 0) {
          const tableData = [['Time', 'Status', 'Duration']]
          
          logsData.data.forEach(log => {
            const status = log.execution_status === 'success' ? chalk.green('✅') : chalk.red('❌')
            
            tableData.push([
              new Date(log.executed_at).toLocaleString(),
              status + ' ' + log.execution_status,
              log.execution_time ? `${log.execution_time}ms` : 'N/A'
            ])
          })
          
          console.log(table(tableData))
        }
        
      } catch (execError) {
        const duration = Date.now() - startTime
        
        console.log(chalk.red(`❌ Failed after ${duration}ms`))
        console.log(chalk.red('\n💥 Error:\n'))
        console.log(execError.response?.data || execError.message)
        process.exit(1)
      }
    } catch (error) {
      console.log(chalk.red('❌ Test failed:'), error.message)
      process.exit(1)
    }
  })

// ========================================
// Legacy User Management Commands (Direct DB Access)
// ========================================
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

// ---------------------------------------------------------------------------
// run — execute a function locally using the invoke-execution sandbox
// ---------------------------------------------------------------------------

program
  .command('run [path]')
  .description('Run a function locally using the same isolated-vm environment as the execution service')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('-p, --path <urlpath>', 'Request path', '/')
  .option('-d, --data <json>', 'Request body as a JSON string')
  .option('-H, --header <key:value>', 'Request header (repeatable)', (val, acc) => { acc.push(val); return acc; }, [])
  .option('-e, --env <file>', 'Path to a .env file to load (defaults to <path>/.env)')
  .option('--kv-file <file>', 'JSON file for KV store persistence (default: in-memory)')
  .action(async (fnPath, options) => {
    fnPath = fnPath || '.';
    
    // Force pool size to 1 BEFORE requiring invoke-execution so IsolatePool
    // constructor reads the updated env vars.
    process.env.ISOLATE_POOL_SIZE = '1';
    process.env.ISOLATE_MAX_POOL_SIZE = '1';
    process.env.ISOLATE_SUPPRESS_LOGGING = 'true';
    process.env.REDIRECT_OUTPUT = 'no-func-id';

    const { ExecutionEngine } = require('invoke-execution/services/execution-engine');
    const { createLocalKVFactory } = require('./services/local-kv');
    const dotenv = require('dotenv');

    const absoluteFnDir = path.resolve(fnPath);
    const indexPath = path.join(absoluteFnDir, 'index.js');

    if (!fs.existsSync(indexPath)) {
      console.error(chalk.red(`✗ index.js not found in: ${absoluteFnDir}`));
      process.exit(1);
    }

    // Load .env for the function
    const envFile = options.env || path.join(absoluteFnDir, '.env');
    const envVars = fs.existsSync(envFile) ? (dotenv.parse(fs.readFileSync(envFile)) || {}) : {};

    // Parse headers
    const headers = {};
    for (const raw of options.header) {
      const sep = raw.indexOf(':');
      if (sep === -1) { console.warn(chalk.yellow(`Warning: ignoring malformed header "${raw}" (expected key:value)`)); continue; }
      headers[raw.slice(0, sep).trim().toLowerCase()] = raw.slice(sep + 1).trim();
    }

    // Parse body
    let body = {};
    if (options.data) {
      try { body = JSON.parse(options.data); } catch {
        console.error(chalk.red('✗ --data is not valid JSON')); process.exit(1);
      }
    }

    const reqUrl = (options.path || '/').startsWith('/') ? options.path : '/' + options.path;

    const reqData = {
      method: options.method.toUpperCase(),
      url: reqUrl,
      originalUrl: reqUrl,
      path: reqUrl.split('?')[0],
      protocol: 'http',
      hostname: 'localhost',
      host: 'localhost',
      secure: false,
      ip: '127.0.0.1',
      ips: [],
      body,
      query: {},
      params: {},
      headers: { 'content-type': 'application/json', ...headers },
    };

    const engine = new ExecutionEngine({
      kvStoreFactory: createLocalKVFactory(options.kvFile),
      metadataProvider: async () => ({ package_hash: 'local', project_id: 'local' }),
      envVarsProvider: async () => envVars,
      networkPoliciesProvider: async () => ({ globalRules: [], projectRules: [] }),
    });

    try {
      console.log(chalk.cyan(`▶ Running: ${absoluteFnDir}`));
      if (options.kvFile) console.log(chalk.gray(`  KV store: ${path.resolve(options.kvFile)}`));
      else console.log(chalk.gray('  KV store: in-memory'));
      console.log('');

      await engine.initialize();

      const result = await engine.executeFunction(indexPath, { req: reqData }, 'local');

      if (result.error) {
        console.log('\n' + chalk.red('=== Error ==='));
        console.error(result.error);
        process.exitCode = 1;
      } else {
        const statusColor = result.statusCode >= 400 ? chalk.red : chalk.green;
        console.log('\n' + chalk.cyan('=== Response ==='));
        console.log(`Status: ${statusColor(result.statusCode)}`);
        
        if (result.headers) {
          console.log('\n' + chalk.gray('Response Headers:'));
          for (const [key, value] of Object.entries(result.headers)) {
            console.log(`${key}: ${value}`);
          }
        }
        
        console.log('\n' + chalk.gray('Response Body:'));
        if (result.data !== undefined) {
          const body = Buffer.isBuffer(result.data) ? result.data.toString('utf8') : String(result.data);
          try { console.log(JSON.stringify(JSON.parse(body), null, 2)); }
          catch { console.log(body); }
        }
      }
    } catch (err) {
      console.error(chalk.red('✗ Execution failed:'), err.message);
      process.exitCode = 1;
    } finally {
      await engine.shutdown();
    }
  });

// Parse command line arguments
program.parse()

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
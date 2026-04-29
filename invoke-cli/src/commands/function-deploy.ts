import chalk from 'chalk'
import fs from 'fs'
import type { Command } from 'commander'
import { post } from '../services/api-client'
import { prepareUpload } from '../services/file-utils'
import { resolveProjectId, findFunctionByNameAndProject } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:deploy')
    .description('Create a function if it does not exist, then upload and activate a new version (smart upsert)')
    .argument('[path]', 'Path to function directory or zip file')
    .requiredOption('--name <name>', 'Function name')
    .requiredOption('--project <id>', 'Project ID or name')
    .option('--description <text>', 'Function description (used on creation only)')
    .option('--requires-api-key', 'Require API key for invocation (used on creation only)', false)
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (functionPath: string | undefined, options: any) => {
      functionPath = functionPath || '.'

      try {
        options.project = await resolveProjectId(options.project)

        // Step 1: Check if the function already exists
        let functionId: string
        let created = false

        const existing = await findFunctionByNameAndProject(options.name, options.project)

        if (existing) {
          functionId = existing.id
          if (options.output !== 'json') {
            console.log(
              chalk.cyan(`Found existing function "${options.name}" (${functionId}). Deploying new version...`)
            )
          }
        } else {
          // Step 1b: Create the function
          if (options.output !== 'json') {
            console.log(chalk.cyan(`Function "${options.name}" not found. Creating...`))
          }

          const createData = await post('/api/functions', {
            name: options.name,
            project_id: options.project,
            description: options.description || '',
            requires_api_key: options.requiresApiKey
          })

          if (!createData.success) {
            console.log(chalk.red('❌ Failed to create function: ' + createData.message))
            process.exit(1)
          }

          functionId = createData.data.id
          created = true

          if (options.output !== 'json') {
            console.log(chalk.green(`✅ Function created with ID: ${functionId}`))
          }
        }

        // Step 2: Upload code
        if (options.output !== 'json') {
          console.log(chalk.cyan('Uploading code...'))
        }

        const { filePath, cleanup } = await prepareUpload(functionPath)

        try {
          const uploadData = await post(`/api/functions/${functionId}/versions`, undefined, [
            { field: 'file', value: fs.createReadStream(filePath), filename: 'function.zip' }
          ])

          if (!uploadData.success) {
            console.log(chalk.red('❌ Upload failed: ' + uploadData.message))
            process.exit(1)
          }

          const versionNumber = uploadData.data.version

          if (options.output !== 'json') {
            console.log(chalk.green(`✅ Code uploaded as version ${versionNumber}`))
            console.log(chalk.cyan('Activating...'))
          }

          // Step 3: Activate the new version
          const switchData = await post(`/api/functions/${functionId}/switch-version`, {
            version_number: versionNumber
          })

          if (!switchData.success && options.output !== 'json') {
            console.log(chalk.yellow(`⚠️  Deployed but activation failed: ${switchData.message}`))
          }

          if (options.output === 'json') {
            console.log(
              JSON.stringify(
                {
                  id: functionId,
                  name: options.name,
                  version: versionNumber,
                  created,
                  is_active: switchData.success
                },
                null,
                2
              )
            )
          } else {
            const action = created ? 'created and deployed' : 'deployed to'
            console.log(chalk.green(`✅ Function ${action} version ${versionNumber}`))
            console.log(chalk.cyan('\n⚡ Deploy complete!\n'))
            console.log(`ID:      ${functionId}`)
            console.log(`Name:    ${options.name}`)
            console.log(`Version: ${versionNumber}`)
            console.log(`Action:  ${created ? 'Created + deployed' : 'Updated (new version deployed)'}`)
            console.log(`Status:  ${switchData.success ? 'Active' : 'Inactive'}`)
          }
        } finally {
          cleanup()
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Deploy failed:'), error.message)
        process.exit(1)
      }
    })
}

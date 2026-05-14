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
    .argument('[path]', 'Path to function directory or zip file', '.')
    .requiredOption('--name <name>', 'Function name')
    .requiredOption('--project <id>', 'Project ID or name')
    .requiredOption('--language <language>', 'Language (e.g. javascript, typescript, csharp)')
    .requiredOption('--runtime <runtime>', 'Runtime (e.g. bun, dotnet)')
    .option('--description <text>', 'Function description (used on creation only)')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (functionPath: string, options: any) => {
      try {
        options.project = await resolveProjectId(options.project)

        // Step 1: Check if the function already exists
        const existing = await findFunctionByNameAndProject(options.name, options.project)

        if (existing) {
          // ── Update path: upload a new version + switch ──────────────────
          const functionId = existing.id

          if (options.output !== 'json') {
            console.log(
              chalk.cyan(`Found existing function "${options.name}" (${functionId}). Deploying new version...`)
            )
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

            const switchData = await post(`/api/functions/${functionId}/switch-version`, {
              version_number: versionNumber
            })

            if (options.output === 'json') {
              console.log(
                JSON.stringify(
                  {
                    id: functionId,
                    name: options.name,
                    version: versionNumber,
                    created: false,
                    is_active: switchData.success
                  },
                  null,
                  2
                )
              )
            } else {
              if (switchData.buildRequired) {
                console.log(chalk.yellow(`⚡ ${switchData.message}`))
              } else if (!switchData.success) {
                console.log(chalk.yellow(`⚠️  Deployed but activation failed: ${switchData.message}`))
              }
              console.log(chalk.green(`✅ Function deployed to version ${versionNumber}`))
              console.log(chalk.cyan('\n⚡ Deploy complete!\n'))
              console.log(`ID:      ${functionId}`)
              console.log(`Name:    ${options.name}`)
              console.log(`Version: ${versionNumber}`)
              console.log(`Action:  Updated (new version deployed)`)
            }
          } finally {
            cleanup()
          }
        } else {
          // ── Create path: use the unified deploy API ──────────────────────
          if (options.output !== 'json') {
            console.log(chalk.cyan(`Function "${options.name}" not found. Creating...`))
          }

          const { filePath, cleanup } = await prepareUpload(functionPath)

          try {
            const deployData = await post('/api/functions/deploy', undefined, [
              { field: 'mode', value: 'upload' },
              { field: 'name', value: options.name },
              { field: 'language', value: options.language },
              { field: 'runtime', value: options.runtime },
              { field: 'projectId', value: options.project },
              { field: 'description', value: options.description || '' },
              { field: 'file', value: fs.createReadStream(filePath), filename: 'function.zip' }
            ])

            if (!deployData.success) {
              console.log(chalk.red('❌ Failed to create function: ' + deployData.message))
              process.exit(1)
            }

            const { id: functionId, version } = deployData.data

            if (options.output === 'json') {
              console.log(
                JSON.stringify(
                  { id: functionId, name: options.name, version, created: true, is_active: false },
                  null,
                  2
                )
              )
            } else {
              console.log(chalk.green(`✅ Function created with ID: ${functionId}`))
              console.log(chalk.cyan('\n⚡ Deploy complete!\n'))
              console.log(`ID:       ${functionId}`)
              console.log(`Name:     ${options.name}`)
              console.log(`Language: ${options.language}`)
              console.log(`Runtime:  ${options.runtime}`)
              console.log(`Version:  ${version}`)
              console.log(`Action:   Created + build queued`)
              console.log(
                chalk.yellow(
                  '\n⏳ A build has been queued. The function will activate automatically when the build completes.'
                )
              )
            }
          } finally {
            cleanup()
          }
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Deploy failed:'), error.message)
        process.exit(1)
      }
    })
}

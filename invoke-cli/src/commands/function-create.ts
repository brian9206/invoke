import chalk from 'chalk'
import fs from 'fs'
import type { Command } from 'commander'
import * as api from '../services/api-client'
import { prepareUpload } from '../services/file-utils'
import { resolveProjectId } from '../services/helpers'

export function register(program: Command): void {
  program
    .command('function:create')
    .description('Create a new function and queue a build')
    .argument('[path]', 'Path to function directory or zip file', '.')
    .requiredOption('--name <name>', 'Function name')
    .requiredOption('--project <id>', 'Project ID or name')
    .requiredOption('--language <language>', 'Language (e.g. javascript, typescript, csharp)')
    .requiredOption('--runtime <runtime>', 'Runtime (e.g. bun, dotnet)')
    .option('--description <text>', 'Function description')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (functionPath: string, options: any) => {
      try {
        options.project = await resolveProjectId(options.project)

        if (options.output !== 'json') {
          console.log(chalk.cyan('Deploying function...'))
        }

        const { filePath, cleanup } = await prepareUpload(functionPath)

        try {
          const deployData = await api.post('/api/functions/deploy', undefined, [
            { field: 'mode', value: 'upload' },
            { field: 'name', value: options.name },
            { field: 'language', value: options.language },
            { field: 'runtime', value: options.runtime },
            { field: 'projectId', value: options.project },
            { field: 'description', value: options.description || '' },
            { field: 'file', value: fs.createReadStream(filePath), filename: 'function.zip' }
          ])

          if (!deployData.success) {
            console.log(chalk.red('❌ ' + deployData.message))
            process.exit(1)
          }

          const { id: functionId, version, file_size } = deployData.data

          if (options.output === 'json') {
            console.log(JSON.stringify({ id: functionId, name: options.name, version, file_size }, null, 2))
          } else {
            console.log(chalk.green('✅ Function created and build queued'))
            console.log(chalk.cyan('\n⚡ Function created successfully!\n'))
            console.log(`ID:       ${functionId}`)
            console.log(`Name:     ${options.name}`)
            console.log(`Language: ${options.language}`)
            console.log(`Runtime:  ${options.runtime}`)
            console.log(`Version:  ${version}`)
            console.log(
              chalk.yellow(
                '\n⏳ A build has been queued. The function will activate automatically when the build completes.'
              )
            )
          }
        } finally {
          cleanup()
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to create function:'), error.message)
        process.exit(1)
      }
    })
}

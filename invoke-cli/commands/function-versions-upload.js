const chalk = require('chalk')
const FormData = require('form-data')
const fs = require('fs')
const api = require('../services/api-client')
const fileUtils = require('../services/file-utils')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
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
}

module.exports = { register }

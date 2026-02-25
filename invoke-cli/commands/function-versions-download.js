const chalk = require('chalk')
const fileUtils = require('../services/file-utils')
const { resolveFunctionId } = require('../services/helpers')

function register(program) {
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
}

module.exports = { register }

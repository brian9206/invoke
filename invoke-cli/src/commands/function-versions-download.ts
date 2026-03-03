import chalk from 'chalk';
import type { Command } from 'commander';
import { downloadFile } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:versions:download')
    .description('Download a version')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--ver <number>', 'Version number to download', parseInt)
    .option('--output <path>', 'Output path (ends with .zip to save as zip, otherwise extracts to directory)')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);
        const outputPath = options.output || `./function-${id}-v${options.ver}`;

        console.log(chalk.cyan('Downloading version...'));

        await downloadFile(`/api/functions/${id}/versions/${options.ver}/download`, outputPath);

        console.log(chalk.green(`✅ Downloaded to: ${outputPath}`));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to download version:'), error.message);
        process.exit(1);
      }
    });
}

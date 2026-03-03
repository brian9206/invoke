import chalk from 'chalk';
import fs from 'fs';
import type { Command } from 'commander';
import { post } from '../services/api-client';
import { prepareUpload } from '../services/file-utils';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:versions:upload')
    .description('Upload a new version')
    .argument('<id>', 'Function ID or name')
    .argument('<path>', 'Path to function directory or zip file')
    .option('--switch', 'Automatically switch to this version after upload', false)
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, functionPath: string, options: any) => {
      try {
        id = await resolveFunctionId(id);

        if (options.output !== 'json') {
          console.log(chalk.cyan('Preparing upload...'));
        }

        const { filePath, cleanup } = await prepareUpload(functionPath);

        try {
          const data = await post(`/api/functions/${id}/versions`, undefined, [
            { field: 'file', value: fs.createReadStream(filePath), filename: 'function.zip' },
          ]);

          if (!data.success) {
            console.log(chalk.red('❌ Upload failed: ' + data.message));
            process.exit(1);
          }

          const version = data.data;

          if (options.output !== 'json') {
            console.log(chalk.green(`✅ Version ${version.version} uploaded successfully`));
          }

          // Auto-switch if flag is set
          if (options.switch) {
            if (options.output !== 'json') {
              console.log(chalk.cyan('Switching to new version...'));
            }

            const switchData = await post(`/api/functions/${id}/switch-version`, {
              version_number: version.version,
            });

            if (switchData.success) {
              if (options.output !== 'json') {
                console.log(chalk.green(`✅ Switched to version ${version.version}`));
              }
            } else {
              if (options.output !== 'json') {
                console.log(chalk.yellow(`⚠️  Upload succeeded but switch failed: ${switchData.message}`));
              }
            }
          }

          if (options.output === 'json') {
            console.log(JSON.stringify(version, null, 2));
          }
        } finally {
          cleanup();
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to upload version:'), error.message);
        process.exit(1);
      }
    });
}

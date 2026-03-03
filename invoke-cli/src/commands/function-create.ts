import chalk from 'chalk';
import fs from 'fs';
import type { Command } from 'commander';
import FormData from 'form-data';
import * as api from '../services/api-client';
import { prepareUpload } from '../services/file-utils';
import { resolveProjectId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:create')
    .description('Create a new function')
    .argument('<path>', 'Path to function directory or zip file')
    .requiredOption('--name <name>', 'Function name')
    .requiredOption('--project <id>', 'Project ID or name')
    .option('--description <text>', 'Function description')
    .option('--requires-api-key', 'Require API key for invocation', false)
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (functionPath: string, options: any) => {
      try {
        options.project = await resolveProjectId(options.project);

        // Step 1: Create function metadata
        if (options.output !== 'json') {
          console.log(chalk.cyan('Creating function...'));
        }

        const createData = await api.post('/api/functions', {
          name: options.name,
          project_id: options.project,
          description: options.description || '',
          requires_api_key: options.requiresApiKey,
        });

        if (!createData.success) {
          console.log(chalk.red('❌ ' + createData.message));
          process.exit(1);
        }

        const functionId = createData.data.id;

        if (options.output !== 'json') {
          console.log(chalk.green(`✅ Function created with ID: ${functionId}`));
        }

        // Step 2: Upload code
        if (options.output !== 'json') {
          console.log(chalk.cyan('Uploading code...'));
        }

        const { filePath, cleanup } = await prepareUpload(functionPath);

        try {
          const form = new FormData();
          form.append('file', fs.createReadStream(filePath));

          const uploadData = await api.post(`/api/functions/${functionId}/versions`, undefined, [
            { field: 'file', value: fs.createReadStream(filePath), filename: 'function.zip' },
          ]);

          if (!uploadData.success) {
            console.log(chalk.red('❌ Upload failed: ' + uploadData.message));
            process.exit(1);
          }

          const versionNumber = uploadData.data.version;

          if (options.output !== 'json') {
            console.log(chalk.green(`✅ Code uploaded as version ${versionNumber}`));
            console.log(chalk.cyan('Activating function...'));
          }

          // Automatically switch to the uploaded version
          const switchData = await api.post(`/api/functions/${functionId}/switch-version`, {
            version_number: versionNumber,
          });

          if (!switchData.success) {
            if (options.output !== 'json') {
              console.log(chalk.yellow(`⚠️  Function created but activation failed: ${switchData.message}`));
            }
          }

          if (options.output === 'json') {
            console.log(JSON.stringify({ ...createData.data, version: versionNumber, is_active: switchData.success }, null, 2));
          } else {
            console.log(chalk.green('✅ Function activated'));
            console.log(chalk.cyan('\n⚡ Function created successfully!\n'));
            console.log(`ID: ${functionId}`);
            console.log(`Name: ${options.name}`);
            console.log(`Version: ${versionNumber}`);
            console.log(`Status: ${switchData.success ? 'Active' : 'Inactive'}`);
          }
        } finally {
          cleanup();
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to create function:'), error.message);
        process.exit(1);
      }
    });
}

import chalk from 'chalk';
import { table } from 'table';
import type { Command } from 'commander';
import { get } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:env:list')
    .description('List environment variables for a function')
    .argument('<id>', 'Function ID or name')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);
        const data = await get(`/api/functions/${id}/environment-variables`);

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        const envVars = data.data || [];

        if (options.output === 'json') {
          console.log(JSON.stringify(envVars, null, 2));
          return;
        }

        if (envVars.length === 0) {
          console.log(chalk.yellow('🔍 No environment variables found'));
          return;
        }

        console.log(chalk.cyan('\n🔧 Environment Variables:\n'));
        const tableData: string[][] = [['Key', 'Value', 'Created']];

        envVars.forEach((env: any) => {
          tableData.push([
            env.key,
            env.value.length > 40 ? env.value.substring(0, 37) + '...' : env.value,
            new Date(env.created_at).toLocaleString(),
          ]);
        });

        console.log(table(tableData));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to list environment variables:'), error.message);
        process.exit(1);
      }
    });
}

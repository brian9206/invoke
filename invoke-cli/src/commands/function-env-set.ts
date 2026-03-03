import chalk from 'chalk';
import type { Command } from 'commander';
import { post } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:env:set')
    .description('Set an environment variable')
    .argument('<id>', 'Function ID or name')
    .argument('<key>', 'Variable key')
    .argument('<value>', 'Variable value')
    .action(async (id: string, key: string, value: string) => {
      try {
        id = await resolveFunctionId(id);
        const data = await post(`/api/functions/${id}/environment-variables`, { key, value });

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green(`✅ Environment variable '${key}' set successfully`));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to set environment variable:'), error.message);
        process.exit(1);
      }
    });
}

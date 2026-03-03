import chalk from 'chalk';
import type { Command } from 'commander';
import { post } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:versions:switch')
    .description('Switch active version')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--ver <number>', 'Version number to switch to', parseInt)
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);
        const data = await post(`/api/functions/${id}/switch-version`, {
          version_number: options.ver,
        });

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green(`✅ Switched to version ${options.ver}`));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to switch version:'), error.message);
        process.exit(1);
      }
    });
}

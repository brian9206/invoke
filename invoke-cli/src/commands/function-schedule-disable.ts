import chalk from 'chalk';
import type { Command } from 'commander';
import { put } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:schedule:disable')
    .description('Disable function schedule')
    .argument('<id>', 'Function ID or name')
    .action(async (id: string) => {
      try {
        id = await resolveFunctionId(id);
        const data = await put(`/api/functions/${id}/schedule`, {
          schedule_enabled: false,
        });

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green('✅ Schedule disabled successfully'));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to disable schedule:'), error.message);
        process.exit(1);
      }
    });
}

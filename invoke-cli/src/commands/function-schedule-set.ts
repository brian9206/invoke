import chalk from 'chalk';
import type { Command } from 'commander';
import { put } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:schedule:set')
    .description('Set function schedule')
    .argument('<id>', 'Function ID or name')
    .requiredOption('--cron <expression>', 'Cron expression')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);
        const data = await put(`/api/functions/${id}/schedule`, {
          schedule_enabled: true,
          schedule_cron: options.cron,
        });

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green(`✅ Schedule set to: ${options.cron}`));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to set schedule:'), error.message);
        process.exit(1);
      }
    });
}

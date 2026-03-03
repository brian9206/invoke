import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import { post } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:key:regenerate')
    .description('Regenerate function API key')
    .argument('<id>', 'Function ID or name')
    .option('--force', 'Skip confirmation', false)
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);

        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'Are you sure? This will invalidate the existing API key.',
              default: false,
            },
          ]);

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }

        const data = await post(`/api/functions/${id}/regenerate-key`);

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green('✅ API key regenerated successfully'));
        console.log(chalk.cyan('\n🔑 New API Key:\n'));
        console.log(data.data.api_key);
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to regenerate key:'), error.message);
        process.exit(1);
      }
    });
}

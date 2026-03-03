import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import { delete as del } from '../services/api-client';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:env:delete')
    .description('Delete an environment variable')
    .argument('<id>', 'Function ID or name')
    .argument('<key>', 'Variable key')
    .option('--force', 'Skip confirmation', false)
    .action(async (id: string, key: string, options: any) => {
      try {
        id = await resolveFunctionId(id);

        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete environment variable '${key}'?`,
              default: false,
            },
          ]);

          if (!answers.confirmed) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }

        const data = await del(`/api/functions/${id}/environment-variables/${key}`);

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        console.log(chalk.green(`✅ Environment variable '${key}' deleted successfully`));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to delete environment variable:'), error.message);
        process.exit(1);
      }
    });
}

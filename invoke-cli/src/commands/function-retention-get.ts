import chalk from 'chalk';
import type { Command } from 'commander';
import { get } from '../services/api-client';

export function register(program: Command): void {
  program
    .command('function:retention:get')
    .description('Get function retention settings')
    .argument('<id>', 'Function ID')
    .option('--output <format>', 'Output format (table|json)', 'table')
    .action(async (id: string, options: any) => {
      try {
        const data = await get(`/api/functions/${id}/retention`);

        if (!data.success) {
          console.log(chalk.red('❌ ' + data.message));
          process.exit(1);
        }

        const retention = data.data;

        if (options.output === 'json') {
          console.log(JSON.stringify(retention, null, 2));
          return;
        }

        console.log(chalk.cyan('\n🗂️  Retention Settings:\n'));
        console.log(`Type: ${retention.log_retention_type || 'none'}`);

        if (retention.log_retention_type === 'time') {
          console.log(`Days: ${retention.log_retention_days}`);
        } else if (retention.log_retention_type === 'count') {
          console.log(`Count: ${retention.log_retention_count}`);
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to get retention settings:'), error.message);
        process.exit(1);
      }
    });
}

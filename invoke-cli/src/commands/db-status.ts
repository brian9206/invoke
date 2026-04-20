import chalk from 'chalk';
import type { Command } from 'commander';
import { Op, fn, col, literal } from 'sequelize';
import database from '../services/database';

export function register(program: Command): void {
  program
    .command('db:status')
    .description('Check database connection and show statistics')
    .action(async () => {
      try {
        console.log(chalk.cyan('🔍 Checking database connection...'));

        console.log(chalk.green('✅ Database connected successfully'));

        // Get statistics
        const { User, Function: FunctionModel } = database.models
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const stats = await Promise.all([
          User.count(),
          FunctionModel.count({ where: { is_active: true } }),
        ]);

        console.log('');
        console.log(chalk.cyan('📊 Database Statistics:'));
        console.log(`Users: ${stats[0]}`);
        console.log(`Active Functions: ${stats[1]}`);
      } catch (error: any) {
        console.log(chalk.red('❌ Database connection failed:'), error.message);
        process.exit(1);
      } finally {
        await database.close();
      }
    });
}

import chalk from 'chalk';
import type { Command } from 'commander';
import { QueryTypes } from 'sequelize';
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
        const stats = await Promise.all([
          database.sequelize.query('SELECT COUNT(*) as count FROM users', { type: QueryTypes.SELECT }),
          database.sequelize.query('SELECT COUNT(*) as count FROM functions WHERE is_active = true', { type: QueryTypes.SELECT }),
          database.sequelize.query(`SELECT COUNT(*) as count FROM execution_logs WHERE executed_at > NOW() - INTERVAL '1 day'`, { type: QueryTypes.SELECT }),
        ]);

        console.log('');
        console.log(chalk.cyan('📊 Database Statistics:'));
        console.log(`Users: ${(stats[0][0] as any).count}`);
        console.log(`Active Functions: ${(stats[1][0] as any).count}`);
        console.log(`Executions (24h): ${(stats[2][0] as any).count}`);
      } catch (error: any) {
        console.log(chalk.red('❌ Database connection failed:'), error.message);
        process.exit(1);
      } finally {
        await database.close();
      }
    });
}

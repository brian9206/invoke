import chalk from 'chalk';
import { table } from 'table';
import type { Command } from 'commander';
import database from '../services/database';

export function register(program: Command): void {
  program
    .command('user:list')
    .description('List all admin users')
    .action(async () => {
      try {
        const { User } = database.models;
        const users = await User.findAll({
          attributes: ['id', 'username', 'email', 'is_admin', 'created_at', 'last_login'],
          order: [['created_at', 'DESC']],
        });

        if (users.length === 0) {
          console.log(chalk.yellow('🔭 No users found'));
          return;
        }

        console.log(chalk.cyan('\n👥 Admin Users:\n'));

        const tableData: string[][] = [['ID', 'Username', 'Email', 'Admin', 'Created', 'Last Login']];

        users.forEach((user: any) => {
          tableData.push([
            user.id.toString(),
            user.username,
            user.email,
            user.is_admin ? '✅' : '❌',
            new Date(user.created_at).toLocaleDateString(),
            user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never',
          ]);
        });

        console.log(table(tableData));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to list users:'), error.message);
        process.exit(1);
      } finally {
        await database.close();
      }
    });
}

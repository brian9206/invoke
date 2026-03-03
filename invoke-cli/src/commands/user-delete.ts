import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import database from '../services/database';

export function register(program: Command): void {
  program
    .command('user:delete')
    .description('Delete an admin user')
    .action(async () => {
      try {
        const { User } = database.models;

        // First, list users to choose from
        const users = await User.findAll({
          attributes: ['id', 'username', 'email'],
          order: [['username', 'ASC']],
        });

        if (users.length === 0) {
          console.log(chalk.yellow('🔭 No users found'));
          return;
        }

        const choices = users.map((user: any) => ({
          name: `${user.username} (${user.email})`,
          value: user.id,
        }));

        const { userId, confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'userId',
            message: 'Select user to delete:',
            choices,
          },
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure? This action cannot be undone.',
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('❌ Operation cancelled'));
          return;
        }

        // Delete user
        await User.destroy({ where: { id: userId } });

        console.log(chalk.green('✅ User deleted successfully'));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to delete user:'), error.message);
        process.exit(1);
      } finally {
        await database.close();
      }
    });
}

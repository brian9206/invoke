import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import database from '../services/database';
import { hashPassword } from '../services/utils';

export function register(program: Command): void {
  program
    .command('user:setpassword')
    .description('Force set a password for a user')
    .action(async () => {
      try {
        const { User } = database.models;

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

        const { userId, newPassword, confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'userId',
            message: 'Select user:',
            choices,
          },
          {
            type: 'password',
            name: 'newPassword',
            message: 'Enter new password:',
            validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters',
          },
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure you want to change this user\'s password?',
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('❌ Operation cancelled'));
          return;
        }

        const hashed = await hashPassword(newPassword);
        await User.update({ password_hash: hashed }, { where: { id: userId } });

        console.log(chalk.green('✅ Password updated successfully'));
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to set password:'), error.message);
        process.exit(1);
      } finally {
        await database.close();
      }
    });
}

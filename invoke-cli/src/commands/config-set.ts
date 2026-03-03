import chalk from 'chalk';
import type { Command } from 'commander';
import { loadConfig, saveConfig, CONFIG_FILE } from '../services/config';

export function register(program: Command): void {
  program
    .command('config:set')
    .description('Configure API key and base URL')
    .option('--api-key <key>', 'API key for authentication')
    .option('--base-url <url>', 'Base URL for Invoke API (default: http://localhost:3000)')
    .option('--execution-url <url>', 'Execution service URL (default: http://localhost:3001)')
    .action((options) => {
      try {
        const currentConfig = loadConfig();

        if (options.apiKey) {
          currentConfig.apiKey = options.apiKey;
        }

        if (options.baseUrl) {
          currentConfig.baseUrl = options.baseUrl;
        }

        if (options.executionUrl) {
          currentConfig.executionUrl = options.executionUrl;
        }

        if (!options.apiKey && !options.baseUrl && !options.executionUrl) {
          console.log(chalk.red('❌ Please provide at least one option: --api-key, --base-url, or --execution-url'));
          return;
        }

        saveConfig(currentConfig);
        console.log(chalk.green('✅ Configuration saved successfully!'));
        console.log(chalk.cyan('\nCurrent configuration:'));
        console.log(`Config file: ${CONFIG_FILE}`);
        console.log(`API Key: ${currentConfig.apiKey ? '***' + currentConfig.apiKey.slice(-8) : 'Not set'}`);
        console.log(`Base URL: ${currentConfig.baseUrl || 'http://localhost:3000'}`);
        console.log(`Execution URL: ${currentConfig.executionUrl || 'http://localhost:3001'}`);
      } catch (error: any) {
        console.log(chalk.red('❌ Failed to save configuration:'), error.message);
        process.exit(1);
      }
    });
}

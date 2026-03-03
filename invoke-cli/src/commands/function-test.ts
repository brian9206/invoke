import chalk from 'chalk';
import fs from 'fs';
import axios from 'axios';
import { table } from 'table';
import type { Command } from 'commander';
import { get } from '../services/api-client';
import { getExecutionUrl } from '../services/config';
import { resolveFunctionId } from '../services/helpers';

export function register(program: Command): void {
  program
    .command('function:test')
    .description('Test a function with enhanced output')
    .argument('<id>', 'Function ID or name')
    .option('--path <path>', 'Path to append to URL (e.g., /users/123)', '')
    .option('--method <method>', 'HTTP method (GET|POST|PUT|DELETE|PATCH)', 'POST')
    .option('--header <header...>', 'Custom headers (e.g., "x-api-key: xxx")', [])
    .option('--data <json>', 'JSON data to pass to the function')
    .option('--body <data>', 'Raw request body')
    .option('--file <path>', 'Path to JSON file with request data')
    .action(async (id: string, options: any) => {
      try {
        id = await resolveFunctionId(id);

        // Get function details
        const fnData = await get(`/api/functions/${id}`);

        if (!fnData.success) {
          console.log(chalk.red('❌ ' + fnData.message));
          process.exit(1);
        }

        const fn = fnData.data;

        console.log(chalk.cyan('\n🧪 Testing Function:\n'));
        console.log(`Name: ${fn.name}`);
        console.log(`ID: ${fn.id}`);
        console.log(`Active: ${fn.is_active ? 'Yes' : 'No'}`);
        console.log(`Version: ${fn.active_version || 'None'}`);
        console.log(`Requires API Key: ${fn.requires_api_key ? 'Yes' : 'No'}`);

        if (!fn.is_active) {
          console.log(chalk.yellow('\n⚠️  Warning: Function is not active'));
        }

        if (!fn.active_version) {
          console.log(chalk.red('\n❌ Error: No active version. Upload code first.'));
          process.exit(1);
        }

        // Prepare request data
        let requestData: any = null;

        if (options.body) {
          requestData = options.body;
        } else if (options.data) {
          try {
            requestData = JSON.parse(options.data);
          } catch {
            console.log(chalk.red('❌ Invalid JSON data'));
            process.exit(1);
          }
        } else if (options.file) {
          try {
            requestData = JSON.parse(fs.readFileSync(options.file, 'utf8'));
          } catch (e: any) {
            console.log(chalk.red('❌ Failed to read or parse file:'), e.message);
            process.exit(1);
          }
        }

        // Build execution URL with optional path
        const executionUrl = getExecutionUrl();
        const pathSuffix = options.path || '';
        const url = `${executionUrl}/invoke/${fn.id}${pathSuffix}`;

        console.log(chalk.cyan('\n⚡ Executing...\n'));

        const startTime = Date.now();

        try {
          const headers: Record<string, string> = {};

          if (fn.requires_api_key && fn.api_key) {
            headers['x-api-key'] = fn.api_key;
          }

          // Add custom headers
          if (options.header && options.header.length > 0) {
            (options.header as string[]).forEach((h) => {
              const [key, ...valueParts] = h.split(':');
              if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim();
              }
            });
          }

          const response = await axios({
            method: options.method || 'POST',
            url,
            data: requestData,
            headers,
            timeout: 30000,
          });

          const duration = Date.now() - startTime;

          console.log(chalk.green(`✅ Success in ${duration}ms`));
          console.log(chalk.cyan('\n📊 Response:\n'));
          console.log(JSON.stringify(response.data, null, 2));

          // Fetch recent logs
          console.log(chalk.cyan('\n📋 Recent Logs:\n'));

          const logsData = await get(`/api/functions/${id}/logs`, { limit: 5, page: 1 });

          if (logsData.success && logsData.data.logs && logsData.data.logs.length > 0) {
            const tableData: string[][] = [['Time', 'Status', 'Duration']];

            logsData.data.logs.forEach((log: any) => {
              const status = log.status_code < 400 ? chalk.green('✅') : chalk.red('❌');

              tableData.push([
                new Date(log.executed_at).toLocaleString(),
                status + ' ' + log.status_code,
                log.execution_time_ms ? `${log.execution_time_ms}ms` : 'N/A',
              ]);
            });

            console.log(table(tableData));
          }
        } catch (execError: any) {
          const duration = Date.now() - startTime;

          console.log(chalk.red(`❌ Failed after ${duration}ms`));
          console.log(chalk.red('\n💥 Error:\n'));
          console.log(execError.response?.data || execError.message);

          // Fetch logs to show the actual error details
          try {
            const logsData = await get(`/api/functions/${id}/logs`, { limit: 1, page: 1 });
            const latestLog = logsData.success && logsData.data.logs && logsData.data.logs[0];
            if (latestLog && latestLog.error_message) {
              console.log(chalk.red('\n📋 Error Log:\n'));
              console.log(latestLog.error_message);
            }
          } catch {
            // ignore log fetch errors
          }

          process.exit(1);
        }
      } catch (error: any) {
        console.log(chalk.red('❌ Test failed:'), error.message);
        process.exit(1);
      }
    });
}

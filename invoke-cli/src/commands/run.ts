import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import type { Command } from 'commander';
import { createLocalKVFactory } from '../services/local-kv';
import { createReqObject, createResObject, stateToResponseData } from 'invoke-runtime/dist/request-response';
import type { RequestData } from 'invoke-runtime/dist/protocol';

export function register(program: Command): void {
  program
    .command('run [path]')
    .description('Run a function locally')
    .option('-m, --method <method>', 'HTTP method', 'GET')
    .option('-p, --path <urlpath>', 'Request path', '/')
    .option('-d, --data <json>', 'Request body as a JSON string')
    .option('-H, --header <key:value>', 'Request header (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .option('-e, --env <file>', 'Path to a .env file to load (defaults to <path>/.env)')
    .option('--kv-file <file>', 'JSON file for KV store persistence (default: in-memory)')
    .action(async (fnPath: string | undefined, options: any) => {
      fnPath = fnPath || '.';

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dotenv = require('dotenv') as typeof import('dotenv');

      const absoluteFnDir = path.resolve(fnPath);
      const indexPath = path.join(absoluteFnDir, 'index.js');

      if (!fs.existsSync(indexPath)) {
        console.error(chalk.red(`✗ index.js not found in: ${absoluteFnDir}`));
        process.exit(1);
      }

      // Load .env for the function
      const envFile = options.env || path.join(absoluteFnDir, '.env');
      const envVars: Record<string, string> = fs.existsSync(envFile)
        ? (dotenv.parse(fs.readFileSync(envFile)) || {})
        : {};

      // Parse headers
      const headers: Record<string, string> = {};
      for (const raw of options.header as string[]) {
        const sep = raw.indexOf(':');
        if (sep === -1) {
          console.warn(chalk.yellow(`Warning: ignoring malformed header "${raw}" (expected key:value)`));
          continue;
        }
        headers[raw.slice(0, sep).trim().toLowerCase()] = raw.slice(sep + 1).trim();
      }

      // Parse body
      let body: any = {};
      if (options.data) {
        try {
          body = JSON.parse(options.data);
        } catch {
          console.error(chalk.red('✗ --data is not valid JSON'));
          process.exit(1);
        }
      }

      const reqUrl = (options.path || '/').startsWith('/') ? options.path : '/' + options.path;

      // Set up KV on globalThis for the user function
      const kvFactory = createLocalKVFactory(options.kvFile);
      const kvStore = kvFactory('local');
      (globalThis as any).kv = {
        get: async (key: string) => kvStore.get(key),
        set: async (key: string, value: unknown, ttl?: number) => kvStore.set(key, value, ttl),
        delete: async (key: string) => kvStore.delete(key),
        clear: async () => kvStore.clear(),
        has: async (key: string) => kvStore.has(key),
      };

      // Set up a no-op realtime on globalThis
      (globalThis as any).realtime = {
        send: async () => {},
        emit: async () => {},
        broadcast: async () => {},
        join: async () => {},
        leave: async () => {},
        emitToRoom: async () => {},
      };

      // Inject env vars
      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }

      const requestData: RequestData = {
        method: options.method.toUpperCase(),
        url: reqUrl,
        originalUrl: reqUrl,
        path: reqUrl.split('?')[0],
        protocol: 'http',
        hostname: 'localhost',
        secure: false,
        ip: '127.0.0.1',
        ips: [],
        body,
        query: {},
        params: {},
        headers: { 'content-type': 'application/json', ...headers },
      };

      try {
        console.log(chalk.cyan(`▶ Running: ${absoluteFnDir}`));
        if (options.kvFile) {
          console.log(chalk.gray(`  KV store: ${path.resolve(options.kvFile)}`));
        } else {
          console.log(chalk.gray('  KV store: in-memory'));
        }
        console.log('');

        // Load user module
        const userModule = require(indexPath);
        const handler = typeof userModule === 'function' ? userModule
          : typeof userModule.default === 'function' ? userModule.default
          : null;

        if (!handler) {
          console.error(chalk.red('✗ Module must export a function. Expected: module.exports = function(req, res) {...}'));
          process.exitCode = 1;
          return;
        }

        const req = createReqObject(requestData);
        const { res, state } = createResObject(req);

        const result = handler(req, res);
        if (result && typeof result.then === 'function') {
          await result;
        }

        const responseData = stateToResponseData(state);

        if (responseData.statusCode >= 400) {
          console.log('\n' + chalk.red('=== Response ==='));
        } else {
          console.log('\n' + chalk.cyan('=== Response ==='));
        }

        const statusColor = responseData.statusCode >= 400 ? chalk.red : chalk.green;
        console.log(`Status: ${statusColor(responseData.statusCode)}`);

        if (Object.keys(responseData.headers).length > 0) {
          console.log('\n' + chalk.gray('Response Headers:'));
          for (const [key, value] of Object.entries(responseData.headers)) {
            console.log(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
          }
        }

        console.log('\n' + chalk.gray('Response Body:'));
        if (responseData.body) {
          const bodyStr = Buffer.from(responseData.body, 'base64').toString('utf8');
          try {
            console.log(JSON.stringify(JSON.parse(bodyStr), null, 2));
          } catch {
            console.log(bodyStr);
          }
        }
      } catch (err: any) {
        console.error(chalk.red('✗ Execution failed:'), err.message);
        if (err.stack) console.error(chalk.gray(err.stack));
        process.exitCode = 1;
      }
    });
}

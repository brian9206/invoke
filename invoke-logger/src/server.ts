import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { logSequelize, appDb } from './database';
import { initFunctionLogModel } from './models/FunctionLog';
import { initPayloadFieldModel } from './models/PayloadField';
import ingestRouter from './routes/ingest';
import logsRouter from './routes/logs';
import statsRouter from './routes/stats';
import cleanupRouter from './routes/cleanup';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MigrationManager = require('invoke-shared/migration-manager');

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

async function validateEnvironment(): Promise<void> {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'LOG_DB_HOST', 'LOG_DB_NAME', 'LOG_DB_USER', 'LOG_DB_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (!INTERNAL_SECRET) {
    console.warn(
      '[Logger] WARNING: INTERNAL_SERVICE_SECRET is not set. All requests will be accepted without authentication.',
    );
  }
}

async function main(): Promise<void> {
  await validateEnvironment();

  // 1. Register the local models on the log Sequelize instance
  initFunctionLogModel(logSequelize);
  initPayloadFieldModel(logSequelize);

  // 2. Run log DB migrations
  const migrationsPath = path.resolve(__dirname, '..', 'migrations');
  const migrationManager = new MigrationManager(logSequelize, { migrationsPath });
  await migrationManager.runMigrations();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Authenticate all non-health requests with internal secret
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    if (INTERNAL_SECRET && req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    next();
  });

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await logSequelize.authenticate();
      res.json({ status: 'ok', service: 'invoke-logger' });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });

  // Mount all routes
  app.use(ingestRouter);
  app.use(logsRouter);
  app.use(statsRouter);
  app.use(cleanupRouter);

  app.listen(PORT, () => {
    console.log(`[Logger] Listening on port ${PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    console.log('[Logger] Shutting down...');
    await logSequelize.close();
    await appDb.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: Error) => {
  console.error('[Logger] Fatal startup error:', err);
  process.exit(1);
});


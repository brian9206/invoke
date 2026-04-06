import 'dotenv/config';
import express, { Request, Response, NextFunction, Application } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { createNotifyListener } from 'invoke-shared';
import { validateEnvironment } from './services/utils';
import database from './services/database';
import cache from './services/cache';
import {
  initialize as initializeExecutionEngine,
  shutdown as shutdownExecutionEngine,
  updateDefaultTimeout,
  invalidateProjectNetwork,
} from './services/execution-service';
import {
  invalidateEnvVarCache,
  invalidateNetworkPolicyCache,
} from './services/function-providers';
import {
  reloadExecutionSettings,
  invalidateExecutionSettings,
} from './services/execution-settings';

import executionRoutes from './routes/execution';
import healthRoutes from './routes/health';
import schedulerRoutes from './routes/scheduler';
import metricsRoutes from './routes/metrics';

const executionPgNotify = createNotifyListener('execution_cache_invalidated', {
  parsePayload: (raw: any) => (typeof raw === 'string' ? JSON.parse(raw) : (raw || {})),
  getDebounceKey: (payload: any) =>
    payload.table === 'function_environment_variables'
      ? `function_environment_variables:${payload.function_id}`
      : payload.table === 'project_network_policies'
        ? `project_network_policies:${payload.project_id}`
        : 'global_network_policies',
});

const executionSettingsPgNotify = createNotifyListener('execution_settings_invalidated', {
  debounceMs: 500,
});

class ExecutionServer {
  app: Application;
  port: number | string;
  server: http.Server | null;

  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.server = null;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware(): void {
    let trustProxy: boolean | number | string = false;
    if (process.env.TRUST_PROXY === 'true') {
      trustProxy = true;
    } else if (process.env.TRUST_PROXY === 'false') {
      trustProxy = false;
    } else if (process.env.TRUST_PROXY && !isNaN(Number(process.env.TRUST_PROXY))) {
      trustProxy = parseInt(process.env.TRUST_PROXY, 10);
    } else {
      trustProxy = process.env.TRUST_PROXY || false;
    }

    this.app.set('trust proxy', trustProxy);

    this.app.use(helmet());

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT ?? '100', 10),
      message: { success: false, message: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/invoke', limiter);

    this.app.use(compression() as any);
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.path === '/health') return next();
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes(): void {
    this.app.use('/health', healthRoutes);
    this.app.use('/metrics', metricsRoutes);
    this.app.use('/invoke', executionRoutes);
    this.app.use('/scheduler', schedulerRoutes);

    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: 'invoke-execution',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          execute: 'POST /invoke/:functionId',
          executeGet: 'GET /invoke/:functionId',
          triggerScheduled: 'POST /scheduler/trigger-scheduled',
        },
        features: {
          apiKeyAuth: true,
          rateLimiting: true,
          isolation: true,
          autoCleanup: true,
        },
      });
    });
  }

  setupErrorHandling(): void {
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Global error:', error);
      const message =
        process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message;

      res.status(error.status || 500).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      });
    });
  }

  async start(): Promise<void> {
    try {
      process.on('unhandledRejection', (reason) => {
        console.error(
          '⚠️ Global unhandled rejection caught:',
          reason instanceof Error ? reason.message : String(reason),
        );
        if (reason instanceof Error) {
          console.error('Stack:', reason.stack);
        }
      });

      process.on('uncaughtException', (error: Error) => {
        console.error('❌ Global uncaught exception caught:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
      });

      validateEnvironment([
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'S3_ENDPOINT',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
      ]);

      if (!process.env.INTERNAL_SERVICE_SECRET) {
        console.warn(
          '⚠️  WARNING: INTERNAL_SERVICE_SECRET is not set. Gateway token verification is disabled.',
        );
      }

      await executionPgNotify.connect((payload: any) => {
        if (payload.table === 'function_environment_variables') {
          invalidateEnvVarCache(payload.function_id);
        } else if (payload.table === 'project_network_policies') {
          invalidateNetworkPolicyCache(payload.project_id);
          invalidateProjectNetwork(payload.project_id).catch((err) =>
            console.error('[NetworkPolicy] Failed to invalidate network:', err),
          );
        } else if (payload.table === 'global_network_policies') {
          invalidateNetworkPolicyCache(null);
          // Global policy change — can't easily remove all project networks.
          // They'll pick up new rules on next ensureNetwork() call.
        }
      });

      await executionSettingsPgNotify.connect(async () => {
        console.log('[ExecutionSettings] Global execution settings changed, reloading...');
        invalidateExecutionSettings();
        const newSettings = await reloadExecutionSettings();
        updateDefaultTimeout(newSettings.defaultTimeoutMs);
        console.log(`[ExecutionSettings] Updated: timeout=${newSettings.defaultTimeoutMs}ms`);
      });

      await cache.initialize();

      console.log('🚀 Initializing execution engine...');
      await initializeExecutionEngine();
      console.log('✅ Execution engine initialized');

      this.server = this.app.listen(this.port, () => {
        console.log(`⚡ Invoke Execution Service running on port ${this.port}`);
        console.log(`🗄️ S3 Endpoint: ${process.env.S3_ENDPOINT}`);
        console.log(
          `🚦 Rate Limit: ${process.env.RATE_LIMIT || 100} requests per 15 minutes`,
        );
        console.log(
          `🏊 Sandbox Pool: min=${process.env.SANDBOX_MIN_POOL_SIZE || 5}, max=${process.env.SANDBOX_MAX_POOL_SIZE || 20}`,
        );

      });

      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
    } catch (error) {
      console.error('❌ Failed to start Execution Service:', error);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Execution Service...');

    if (this.server) {
      this.server.close(() => {
        console.log('⚡ HTTP server stopped');
      });
    }

    await executionPgNotify.stop();
    await executionSettingsPgNotify.stop();

    console.log('🛑 Shutting down execution engine...');
    await shutdownExecutionEngine();
    console.log('✅ Execution engine stopped');

    await database.close();
    console.log('👋 Execution Service shutdown complete');
    process.exit(0);
  }
}

if (require.main === module) {
  const server = new ExecutionServer();
  server.start();
}

export default ExecutionServer;

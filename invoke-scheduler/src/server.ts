require('dotenv').config();

import express, { Request, Response } from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Environment configuration
const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://invoke-execution:3000';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://invoke-admin:3000';
const LOGGER_SERVICE_URL = (process.env.LOGGER_SERVICE_URL || 'http://invoke-logger:3000').replace(/\/$/, '');
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || '';
const SCHEDULER_INTERVAL = parseInt(process.env.SCHEDULER_INTERVAL ?? '60000', 10) || 60000; // 1 minute default
const LOG_CLEANUP_INTERVAL = parseInt(process.env.LOG_CLEANUP_INTERVAL ?? '3600000', 10) || 3600000; // 1 hour default
const BUILD_CLEANUP_INTERVAL = parseInt(process.env.BUILD_CLEANUP_INTERVAL ?? '300000', 10) || 300000; // 5 minutes default

let isRunning = false;

interface SchedulerTriggerResult {
  success: boolean;
  message?: string;
  executed?: number;
  failed?: number;
}

/**
 * Trigger scheduled functions by calling the execution service
 */
async function triggerScheduledFunctions(): Promise<void> {
  if (isRunning) {
    console.log('Scheduler already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = new Date();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`[${startTime.toISOString()}] Checking for scheduled functions...`);

    const response = await fetch(`${EXECUTION_SERVICE_URL}/scheduler/trigger-scheduled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (response.ok) {
      const result = (await response.json()) as SchedulerTriggerResult;
      const executionCount = result.executed || 0;

      if (executionCount > 0) {
        console.log(
          `[${new Date().toISOString()}] Scheduled functions: ${executionCount} executed, ${result.failed ?? 0} failed`,
        );
      } else {
        console.log(
          `[${new Date().toISOString()}] No scheduled functions pending execution`,
        );
      }
    } else {
      console.error(
        `[${new Date().toISOString()}] Scheduler request failed:`,
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[${new Date().toISOString()}] Error triggering scheduled functions:`,
      message,
    );
  } finally {
    clearTimeout(timeoutId);
    isRunning = false;
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[${endTime.toISOString()}] Scheduler check completed in ${duration}ms`);
  }
}

/**
 * Trigger log cleanup by calling the admin service
 */
async function triggerCleanupLogs(): Promise<void> {
  const startTime = new Date();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`[${startTime.toISOString()}] Running log retention cleanup...`);

    if (!INTERNAL_SERVICE_SECRET) {
      console.warn(`[${new Date().toISOString()}] INTERNAL_SERVICE_SECRET is not set — skipping log cleanup`);
      return;
    }

    const response = await fetch(`${LOGGER_SERVICE_URL}/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    if (response.ok) {
      const result = await response.json() as { data?: { deleted: number; functions: number }; message?: string };
      console.log(
        `[${new Date().toISOString()}] Log cleanup complete: ${result.data?.deleted ?? 0} logs deleted across ${result.data?.functions ?? 0} functions`,
      );
    } else {
      console.error(
        `[${new Date().toISOString()}] Log cleanup request failed:`,
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${new Date().toISOString()}] Error triggering log cleanup:`, message);
  } finally {
    clearTimeout(timeoutId);
    const duration = new Date().getTime() - startTime.getTime();
    console.log(`[${new Date().toISOString()}] Log cleanup check completed in ${duration}ms`);
  }
}

/**
 * Cancel expired builds (queued/running > 60 minutes) by calling the execution service
 */
async function cancelExpiredBuilds(): Promise<void> {
  const startTime = new Date();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${EXECUTION_SERVICE_URL}/scheduler/cancel-expired-builds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      const result = await response.json() as { cancelled?: number };
      if (result.cancelled && result.cancelled > 0) {
        console.log(`[${new Date().toISOString()}] Cancelled ${result.cancelled} expired builds`);
      }
    } else {
      console.error(`[${new Date().toISOString()}] Cancel expired builds failed:`, response.status, response.statusText);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${new Date().toISOString()}] Error cancelling expired builds:`, message);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Start the scheduler interval
 */
function startScheduler(): void {
  console.log(`Starting Invoke Function Scheduler (interval: ${SCHEDULER_INTERVAL}ms)`);
  console.log(`Execution service URL: ${EXECUTION_SERVICE_URL}`);
  console.log(`Admin service URL: ${ADMIN_SERVICE_URL}`);
  console.log(`Logger service URL: ${LOGGER_SERVICE_URL}`);
  console.log(`Log cleanup interval: ${LOG_CLEANUP_INTERVAL}ms`);
  console.log(`Build cleanup interval: ${BUILD_CLEANUP_INTERVAL}ms`);

  // calculate next :00 second to align with minute intervals
  const now = new Date();
  const delayUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  setTimeout(() => {
    void triggerScheduledFunctions();
    void triggerCleanupLogs();
    void cancelExpiredBuilds();

    // Set up intervals after the initial delay
    setInterval(() => void triggerScheduledFunctions(), SCHEDULER_INTERVAL);
    setInterval(() => void triggerCleanupLogs(), LOG_CLEANUP_INTERVAL);
    setInterval(() => void cancelExpiredBuilds(), BUILD_CLEANUP_INTERVAL);
  }, delayUntilNextMinute);
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'invoke-scheduler',
    timestamp: new Date().toISOString(),
    schedulerInterval: SCHEDULER_INTERVAL,
    logCleanupInterval: LOG_CLEANUP_INTERVAL,
    buildCleanupInterval: BUILD_CLEANUP_INTERVAL,
    executionServiceUrl: EXECUTION_SERVICE_URL,
    adminServiceUrl: ADMIN_SERVICE_URL,
  });
});

// Manual trigger endpoint
app.post('/trigger', async (_req: Request, res: Response) => {
  try {
    await triggerScheduledFunctions();
    res.json({
      success: true,
      message: 'Scheduled functions triggered successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger scheduled functions',
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Status endpoint
app.get('/status', (_req: Request, res: Response) => {
  res.json({
    service: 'invoke-scheduler',
    status: 'running',
    isSchedulerRunning: isRunning,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    config: {
      schedulerInterval: SCHEDULER_INTERVAL,
      logCleanupInterval: LOG_CLEANUP_INTERVAL,
      executionServiceUrl: EXECUTION_SERVICE_URL,
      adminServiceUrl: ADMIN_SERVICE_URL,
    },
  });
});

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`Scheduler service listening on port ${port}`);

  // Start the scheduler after a short delay to ensure services are ready
  setTimeout(startScheduler, 5000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Scheduler service shut down');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Scheduler service shut down');
    process.exit(0);
  });
});

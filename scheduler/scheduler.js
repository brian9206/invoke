const http = require('http');
const express = require('express');

const app = express();
const port = process.env.PORT || 3002;

// Environment configuration
const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://invoke-execution:3001';
const SCHEDULER_INTERVAL = parseInt(process.env.SCHEDULER_INTERVAL) || 60000; // 1 minute default

let isRunning = false;

/**
 * Trigger scheduled functions by calling the execution service
 */
async function triggerScheduledFunctions() {
  if (isRunning) {
    console.log('Scheduler already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = new Date();
  
  try {
    console.log(`[${startTime.toISOString()}] Checking for scheduled functions...`);
    
    const response = await fetch(`${EXECUTION_SERVICE_URL}/scheduler/trigger-scheduled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    if (response.ok) {
      const result = await response.json();
      const executionCount = result.executedFunctions || 0;
      
      if (executionCount > 0) {
        console.log(`[${new Date().toISOString()}] Successfully triggered ${executionCount} scheduled functions`);
      } else {
        console.log(`[${new Date().toISOString()}] No scheduled functions pending execution`);
      }
    } else {
      console.error(`[${new Date().toISOString()}] Scheduler request failed:`, response.status, response.statusText);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error triggering scheduled functions:`, error.message);
  } finally {
    isRunning = false;
    const endTime = new Date();
    const duration = endTime - startTime;
    console.log(`[${endTime.toISOString()}] Scheduler check completed in ${duration}ms`);
  }
}

/**
 * Start the scheduler interval
 */
function startScheduler() {
  console.log(`Starting Invoke Function Scheduler (interval: ${SCHEDULER_INTERVAL}ms)`);
  console.log(`Execution service URL: ${EXECUTION_SERVICE_URL}`);
  
  // Run immediately on start
  triggerScheduledFunctions();
  
  // Set up interval
  setInterval(triggerScheduledFunctions, SCHEDULER_INTERVAL);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'invoke-scheduler',
    timestamp: new Date().toISOString(),
    schedulerInterval: SCHEDULER_INTERVAL,
    executionServiceUrl: EXECUTION_SERVICE_URL
  });
});

// Manual trigger endpoint
app.post('/trigger', async (req, res) => {
  try {
    await triggerScheduledFunctions();
    res.json({
      success: true,
      message: 'Scheduled functions triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to trigger scheduled functions',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    service: 'invoke-scheduler',
    status: 'running',
    isSchedulerRunning: isRunning,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    config: {
      schedulerInterval: SCHEDULER_INTERVAL,
      executionServiceUrl: EXECUTION_SERVICE_URL
    }
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
import express, { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CronJob } from 'cron';
import database from '../services/database';
import { executeFunction, createExecutionContext, getFunctionPackage } from '../services/execution-service';
import { logExecution } from '../services/utils';

const router = express.Router();

function calculateNextExecution(cronExpression: string): Date | null {
  try {
    const job = new CronJob(cronExpression, function () {});
    const next = job.nextDate() as any;
    const nextDate = next.toDate ? next.toDate() : new Date(next);
    console.log(`Cron expression "${cronExpression}" next execution: ${nextDate.toString()}`);
    return nextDate;
  } catch (error: any) {
    console.error(`Error parsing cron expression "${cronExpression}":`, error.message);
    return null;
  }
}

async function executeScheduledFunction(functionData: any): Promise<any> {
  const startTime = Date.now();

  try {
    console.log(`Executing scheduled function: ${functionData.name} (ID: ${functionData.id})`);

    const { indexPath, tempDir } = await getFunctionPackage(functionData.id);

    const context = createExecutionContext(
      'POST',
      {},
      {},
      { 'x-scheduled-execution': 'true' },
      {},
      {
        url: '/scheduled',
        method: 'POST',
        protocol: 'http',
        hostname: 'localhost',
        ip: '127.0.0.1',
        ips: [],
      },
      tempDir,
    );

    const result = await executeFunction(indexPath, context, functionData.id);

    const executionTime = Date.now() - startTime;
    const statusCode = result.statusCode || 200;

    const responseData = (context.res && context.res.data) || result.data || result.error || {};

    let responseSize: number | null = null;
    if (Buffer.isBuffer(responseData)) {
      responseSize = Buffer.byteLength(responseData);
    } else if (typeof responseData === 'string') {
      responseSize = Buffer.byteLength(responseData, 'utf8');
    } else if (responseData !== undefined && responseData !== null) {
      responseSize = JSON.stringify(responseData).length;
    }

    await logExecution(functionData.id, executionTime, statusCode, result.error, {
      requestMethod: 'SCHEDULED',
      requestUrl: '/scheduled',
      requestBody: '',
      requestSize: null,
      responseBody: responseData,
      responseSize,
      requestHeaders: { 'x-scheduled-execution': 'true' },
      responseHeaders: result.headers || {},
      consoleOutput: result.logs || [],
      clientIp: '127.0.0.1',
      userAgent: 'Invoke-Scheduler/1.0',
    });

    console.log(`✓ Scheduled function ${functionData.name} executed successfully in ${executionTime}ms`);

    return {
      success: true,
      execution_time_ms: executionTime,
      status_code: statusCode,
      response: responseData,
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error(`✗ Scheduled function ${functionData.name} failed:`, error.message);

    try {
      const { ExecutionLog } = database.models;
      await ExecutionLog.create({
        function_id: functionData.id,
        status_code: 500,
        execution_time_ms: executionTime,
        request_method: 'SCHEDULED',
        request_url: '/scheduled',
        request_size: null,
        executed_at: new Date(),
        response_body: JSON.stringify({ error: error.message }),
        console_logs: [],
      });
    } catch (logError) {
      console.error('Failed to log execution error:', logError);
    }

    throw error;
  }
}

router.post('/trigger-scheduled', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { Function: FunctionModel } = database.models;
    console.log('Checking for scheduled functions to execute...');

    const now = new Date();
    const functionsToExecute = await FunctionModel.findAll({
      where: {
        schedule_enabled: true,
        is_active: true,
        next_execution: { [Op.lte]: now },
      },
      attributes: ['id', 'name', 'schedule_cron', 'next_execution', 'is_active'],
      order: [['next_execution', 'ASC']],
    });

    console.log(`Found ${functionsToExecute.length} functions to execute`);

    const executionResults: any[] = await Promise.all(
      functionsToExecute.map(async (func) => {
        try {
          const executionResult = await executeScheduledFunction(func);

          const nextExecution = calculateNextExecution(func.schedule_cron);
          if (nextExecution) {
            await FunctionModel.update({ next_execution: nextExecution }, { where: { id: func.id } });
            console.log(`Updated next execution for ${func.name}: ${nextExecution.toISOString()}`);
          } else {
            console.error(`Failed to calculate next execution for function ${func.id}`);
            await FunctionModel.update({ schedule_enabled: false }, { where: { id: func.id } });
          }

          return {
            function_id: func.id,
            function_name: func.name,
            success: true,
            execution_time_ms: executionResult.execution_time_ms,
          };
        } catch (error: any) {
          console.error(`Failed to execute scheduled function ${func.name}:`, error);
          return {
            function_id: func.id,
            function_name: func.name,
            success: false,
            error: error.message,
          };
        }
      }),
    );

    res.json({
      success: true,
      message: `Processed ${functionsToExecute.length} scheduled functions`,
      executed: executionResults.filter((r) => r.success).length,
      failed: executionResults.filter((r) => !r.success).length,
    });
  } catch (error: any) {
    console.error('Error in trigger-scheduled endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

export default router;

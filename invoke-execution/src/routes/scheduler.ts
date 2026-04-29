import crypto from 'crypto'
import express, { Request, Response } from 'express'
import { Op } from 'sequelize'
import { CronJob } from 'cron'
import { insertRequestLog } from '../services/logger-client'
import database from '../services/database'
import { executeFunction, createExecutionContext, getFunctionPackage } from '../services/execution-service'

const router = express.Router()

function calculateNextExecution(cronExpression: string): Date | null {
  try {
    const job = new CronJob(cronExpression, function () {})
    const next = job.nextDate() as any
    const nextDate = next.toDate ? next.toDate() : new Date(next)
    console.log(`Cron expression "${cronExpression}" next execution: ${nextDate.toString()}`)
    return nextDate
  } catch (error: any) {
    console.error(`Error parsing cron expression "${cronExpression}":`, error.message)
    return null
  }
}

async function executeScheduledFunction(functionData: any): Promise<any> {
  const startTime = Date.now()
  const traceId = crypto.randomUUID()

  try {
    console.log(`Executing scheduled function: ${functionData.name} (ID: ${functionData.id})`)

    const activeVersion = functionData.activeVersion
    const metadata = {
      id: functionData.id,
      name: functionData.name,
      project_id: functionData.project_id,
      project_slug: functionData.Project?.slug ?? '',
      is_active: functionData.is_active,
      created_at: functionData.created_at,
      updated_at: functionData.updated_at,
      version: activeVersion?.version ?? null,
      package_path: activeVersion?.package_path ?? null,
      package_hash: activeVersion?.package_hash ?? null,
      artifact_path: activeVersion?.artifact_path ?? null,
      artifact_hash: activeVersion?.artifact_hash ?? null,
      file_size: activeVersion?.file_size ?? null,
      custom_timeout_enabled: functionData.custom_timeout_enabled ?? false,
      custom_timeout_seconds: functionData.custom_timeout_seconds ?? null,
      custom_memory_enabled: functionData.custom_memory_enabled ?? false,
      custom_memory_mb: functionData.custom_memory_mb ?? null
    }

    const { indexPath } = await getFunctionPackage(functionData.id, metadata)

    const context = createExecutionContext({
      headers: { 'x-scheduled-execution': 'true' },
      originalReq: {
        url: '/scheduled',
        method: 'POST',
        protocol: 'http',
        hostname: 'localhost',
        ip: '127.0.0.1',
        ips: []
      },
      traceId
    })

    const result = await executeFunction(indexPath, context, functionData.id, metadata)

    const executionTime = Date.now() - startTime
    const statusCode = result.statusCode || 200

    const responseData = (context.res && context.res.data) || result.data || result.error || {}

    let responseSize: number | null = null
    if (Buffer.isBuffer(responseData)) {
      responseSize = Buffer.byteLength(responseData)
    } else if (typeof responseData === 'string') {
      responseSize = Buffer.byteLength(responseData, 'utf8')
    } else if (responseData !== undefined && responseData !== null) {
      responseSize = JSON.stringify(responseData).length
    }

    insertRequestLog({
      project: { id: functionData.project_id },
      function: { id: functionData.id, name: functionData.name },
      traceId,
      executionTime,
      statusCode,
      error: result.error,
      requestInfo: {
        request: {
          url: '/scheduled',
          method: 'POST',
          ip: '127.0.0.1',
          userAgent: 'Invoke-Scheduler/1.0',
          headers: { 'x-scheduled-execution': 'true' },
          body: { size: null }
        },
        response: {
          headers: result.headers || {},
          body: {
            size: responseSize,
            payload: responseData
          }
        }
      }
    })

    const { Function: FunctionModel } = database.models
    await FunctionModel.update(
      { execution_count: database.sequelize.literal('execution_count + 1'), last_executed: new Date() },
      { where: { id: functionData.id } }
    )

    console.log(`✓ Scheduled function ${functionData.name} executed successfully in ${executionTime}ms`)

    return {
      success: true,
      execution_time_ms: executionTime,
      status_code: statusCode,
      response: responseData
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime
    console.error(`✗ Scheduled function ${functionData.name} failed:`, error.message)

    try {
      insertRequestLog({
        project: { id: functionData.project_id },
        function: { id: functionData.id, name: functionData.name },
        traceId,
        executionTime,
        statusCode: 500,
        error: error.message,
        requestInfo: {
          request: {
            url: '/scheduled',
            method: 'POST',
            ip: '127.0.0.1',
            userAgent: 'Invoke-Scheduler/1.0',
            headers: { 'x-scheduled-execution': 'true' },
            body: { size: null }
          },
          response: {
            headers: {},
            body: { size: null }
          }
        }
      })
      const { Function: FunctionModel } = database.models
      await FunctionModel.update(
        { execution_count: database.sequelize.literal('execution_count + 1'), last_executed: new Date() },
        { where: { id: functionData.id } }
      )
    } catch (logError) {
      console.error('Failed to log execution error:', logError)
    }

    throw error
  }
}

router.post('/trigger-scheduled', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { Function: FunctionModel } = database.models
    console.log('Checking for scheduled functions to execute...')

    const now = new Date()
    const { Project, FunctionVersion } = database.models
    const functionsToExecute = await FunctionModel.findAll({
      where: {
        schedule_enabled: true,
        is_active: true,
        next_execution: { [Op.lte]: now }
      },
      include: [
        { model: Project, where: { is_active: true }, required: true },
        { model: FunctionVersion, as: 'activeVersion' }
      ],
      order: [['next_execution', 'ASC']]
    })

    console.log(`Found ${functionsToExecute.length} functions to execute`)

    const executionResults: any[] = await Promise.all(
      functionsToExecute.map(async func => {
        try {
          const executionResult = await executeScheduledFunction(func)

          const nextExecution = calculateNextExecution(func.schedule_cron)
          if (nextExecution) {
            await FunctionModel.update({ next_execution: nextExecution }, { where: { id: func.id } })
            console.log(`Updated next execution for ${func.name}: ${nextExecution.toISOString()}`)
          } else {
            console.error(`Failed to calculate next execution for function ${func.id}`)
            await FunctionModel.update({ schedule_enabled: false }, { where: { id: func.id } })
          }

          return {
            function_id: func.id,
            function_name: func.name,
            success: true,
            execution_time_ms: executionResult.execution_time_ms
          }
        } catch (error: any) {
          console.error(`Failed to execute scheduled function ${func.name}:`, error)
          return {
            function_id: func.id,
            function_name: func.name,
            success: false,
            error: error.message
          }
        }
      })
    )

    res.json({
      success: true,
      message: `Processed ${functionsToExecute.length} scheduled functions`,
      executed: executionResults.filter(r => r.success).length,
      failed: executionResults.filter(r => !r.success).length
    })
  } catch (error: any) {
    console.error('Error in trigger-scheduled endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

// ── Cancel expired builds (queued/running > 60 minutes) ───────────────────
router.post('/cancel-expired-builds', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { FunctionBuild, FunctionVersion } = database.models as any
    const expiryThreshold = new Date(Date.now() - 60 * 60 * 1000) // 60 minutes ago

    // Find builds that are queued or running and created more than 60 minutes ago
    const expiredBuilds = await FunctionBuild.findAll({
      where: {
        status: { [Op.in]: ['queued', 'running'] },
        created_at: { [Op.lt]: expiryThreshold }
      },
      attributes: ['id', 'version_id', 'status']
    })

    if (expiredBuilds.length === 0) {
      res.json({ success: true, cancelled: 0, message: 'No expired builds found' })
      return
    }

    const buildIds = expiredBuilds.map((b: any) => b.id)
    const versionIds = [...new Set(expiredBuilds.map((b: any) => b.version_id))]

    // Cancel all expired builds
    await FunctionBuild.update(
      { status: 'cancelled', error_message: 'Cancelled: build exceeded 60 minute limit', completed_at: new Date() },
      { where: { id: { [Op.in]: buildIds } } }
    )

    // Reset version build_status for versions that were queued/building
    await FunctionVersion.update(
      { build_status: 'none' },
      { where: { id: { [Op.in]: versionIds }, build_status: { [Op.in]: ['queued', 'building'] } } }
    )

    console.log(`[Scheduler] Cancelled ${expiredBuilds.length} expired builds: ${buildIds.join(', ')}`)

    res.json({
      success: true,
      cancelled: expiredBuilds.length,
      build_ids: buildIds,
      message: `Cancelled ${expiredBuilds.length} expired builds`
    })
  } catch (error: any) {
    console.error('Error in cancel-expired-builds endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

export default router

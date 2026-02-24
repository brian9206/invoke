const express = require('express')
const router = express.Router()
const database = require('../services/database')
const cache = require('../services/cache')
const path = require('path')
const fs = require('fs-extra')
const { CronJob } = require('cron')
const { executeFunction, createExecutionContext, getFunctionPackage } = require('../services/execution-service')
const { logExecution } = require('../services/utils')

// Utility function to calculate next execution time based on cron expression
function calculateNextExecution(cronExpression) {
  try {
    // Use cron library for accurate parsing
    const job = new CronJob(cronExpression, function() {})
    const next = job.nextDate()
    
    // Convert to native Date object if needed (cron returns Moment.js object)
    const nextDate = next.toDate ? next.toDate() : new Date(next)
    
    console.log(`Cron expression "${cronExpression}" next execution: ${nextDate.toString()}`)
    return nextDate
    
  } catch (error) {
    console.error(`Error parsing cron expression "${cronExpression}":`, error.message)
    return null
  }
}

/**
 * Execute scheduled function using shared execution service
 */
async function executeScheduledFunction(functionData) {
  const startTime = Date.now()
  
  try {
    console.log(`Executing scheduled function: ${functionData.name} (ID: ${functionData.id})`)

    // Get function package
    const { indexPath, tempDir, fromCache } = await getFunctionPackage(functionData.id)
    
    // Create execution context using shared service
    const context = createExecutionContext(
      'POST',
      {},
      {},
      { 'x-scheduled-execution': 'true' },
      {},
      { 
        url: '/scheduled',
        protocol: 'http',
        hostname: 'localhost',
        ip: '127.0.0.1',
        ips: []
      },
      tempDir
    )

    // Execute the function using shared service
    const result = await executeFunction(indexPath, context, functionData.id)
    
    const executionTime = Date.now() - startTime
    const statusCode = result.statusCode || 200

    // Get the response data from either the function return value or res.json/res.send calls
    const responseData = (context.res && context.res.data) || result.data || result.error || {}
    
    // Calculate response size
    let responseSize = 0;
    if (Buffer.isBuffer(responseData)) {
      responseSize = Buffer.byteLength(responseData);
    } else if (responseData) {
      responseSize = JSON.stringify(responseData).length;
    }

    // Log execution using shared utility
    await logExecution(functionData.id, executionTime, statusCode, result.error, {
      requestMethod: 'SCHEDULED',
      requestUrl: '/scheduled',
      requestBody: '',
      requestSize: 0,
      responseBody: responseData,
      responseSize: responseSize,
      requestHeaders: { 'x-scheduled-execution': 'true' },
      responseHeaders: result.headers || {},
      consoleOutput: result.logs || [],
      clientIp: '127.0.0.1',
      userAgent: 'Invoke-Scheduler/1.0'
    })

    console.log(`✓ Scheduled function ${functionData.name} executed successfully in ${executionTime}ms`)
    
    return {
      success: true,
      execution_time_ms: executionTime,
      status_code: statusCode,
      response: responseData
    }

  } catch (error) {
    const executionTime = Date.now() - startTime
    console.error(`✗ Scheduled function ${functionData.name} failed:`, error.message)
    
    // Log failed execution
    try {
      const logQuery = `
        INSERT INTO execution_logs (
          function_id, status_code, execution_time_ms, 
          request_method, request_url, request_size, executed_at, response_body, console_logs
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `
      
      await database.query(logQuery, [
        functionData.id,
        500,
        executionTime,
        'SCHEDULED',
        '/scheduled',
        0,
        new Date(),
        JSON.stringify({ error: error.message }),
        JSON.stringify([])
      ])
    } catch (logError) {
      console.error('Failed to log execution error:', logError)
    }
    
    throw error
  }
}

// Route to trigger scheduled functions (called by cron/scheduler)
router.post('/trigger-scheduled', async (req, res) => {
  try {
    await database.connect()
    
    console.log('Checking for scheduled functions to execute...')
    
    // Get all functions that are scheduled and due for execution
    const now = new Date()
    const result = await database.query(`
      SELECT id, name, schedule_cron, next_execution, is_active
      FROM functions 
      WHERE schedule_enabled = true 
        AND is_active = true
        AND next_execution <= $1
      ORDER BY next_execution ASC
    `, [now])
    
    const functionsToExecute = result.rows
    console.log(`Found ${functionsToExecute.length} functions to execute`)
    
    const executionResults = []
    
    for (const func of functionsToExecute) {
      try {
        // Execute the function
        const executionResult = await executeScheduledFunction(func)
        executionResults.push({
          function_id: func.id,
          function_name: func.name,
          success: true,
          execution_time_ms: executionResult.execution_time_ms
        })
        
        // Calculate and update next execution time
        const nextExecution = calculateNextExecution(func.schedule_cron)
        if (nextExecution) {
          await database.query(`
            UPDATE functions 
            SET next_execution = $2
            WHERE id = $1
          `, [func.id, nextExecution])
          
          console.log(`Updated next execution for ${func.name}: ${nextExecution.toISOString()}`)
        } else {
          console.error(`Failed to calculate next execution for function ${func.id}`)
          // Disable scheduling if we can't calculate next execution
          await database.query(`
            UPDATE functions 
            SET schedule_enabled = false
            WHERE id = $1
          `, [func.id])
        }
        
      } catch (error) {
        console.error(`Failed to execute scheduled function ${func.name}:`, error)
        executionResults.push({
          function_id: func.id,
          function_name: func.name,
          success: false,
          error: error.message
        })
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${functionsToExecute.length} scheduled functions`,
      executed: executionResults.filter(r => r.success).length,
      failed: executionResults.filter(r => !r.success).length
    })
    
  } catch (error) {
    console.error('Error in trigger-scheduled endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

module.exports = router
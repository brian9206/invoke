const express = require('express')
const router = express.Router()
const database = require('../services/database')
const cache = require('../services/cache')
const path = require('path')
const fs = require('fs-extra')
const { executeFunction, createExecutionContext, getFunctionPackage } = require('../services/execution')

// Utility function to calculate next execution time based on cron expression
function calculateNextExecution(cronExpression) {
  try {
    const parts = cronExpression.trim().split(' ')
    if (parts.length !== 5) return null

    const [minute, hour, day, month, weekday] = parts
    const now = new Date()
    const next = new Date(now)
    
    // Reset seconds and milliseconds
    next.setSeconds(0, 0)
    
    // Handle minute patterns
    if (minute === '*') {
      // Every minute - next minute
      next.setMinutes(next.getMinutes() + 1)
    } else if (minute.startsWith('*/')) {
      // Every N minutes
      const interval = parseInt(minute.slice(2))
      const nextMinute = Math.ceil(now.getMinutes() / interval) * interval
      next.setMinutes(nextMinute)
      if (nextMinute <= now.getMinutes()) {
        next.setHours(next.getHours() + 1)
        next.setMinutes(0)
      }
    } else if (!isNaN(parseInt(minute))) {
      // Specific minute
      const targetMinute = parseInt(minute)
      next.setMinutes(targetMinute)
      if (targetMinute <= now.getMinutes()) {
        next.setHours(next.getHours() + 1)
      }
    }
    
    // Handle hour patterns (simplified)
    if (hour !== '*' && !isNaN(parseInt(hour))) {
      const targetHour = parseInt(hour)
      next.setHours(targetHour)
      if (targetHour < now.getHours() || (targetHour === now.getHours() && next.getMinutes() <= now.getMinutes())) {
        next.setDate(next.getDate() + 1)
      }
    }
    
    return next
  } catch (error) {
    console.error('Error calculating next execution:', error)
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
    const { indexPath, fromCache } = await getFunctionPackage(functionData.id)
    
    // Create execution context using shared service
    const context = await createExecutionContext({
      method: 'POST',
      body: {},
      query: {},
      headers: { 'x-scheduled-execution': 'true' },
      params: {},
      originalReq: { 
        url: '/scheduled',
        protocol: 'http',
        hostname: 'localhost',
        ip: '127.0.0.1',
        ips: []
      }
    })

    // Execute the function using shared service
    const result = await executeFunction(indexPath, context, functionData.id)
    
    const executionTime = Date.now() - startTime
    const statusCode = result.statusCode || 200

    // Get the response data from either the function return value or res.json/res.send calls
    const responseData = context.res.data || result.data || result.error || {}

    // Log execution to database
    const logQuery = `
      INSERT INTO execution_logs (
        function_id, status_code, execution_time_ms, 
        request_method, request_url, executed_at, response_body, console_logs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `
    
    await database.query(logQuery, [
      functionData.id,
      statusCode,
      executionTime,
      'SCHEDULED',
      '/scheduled',
      new Date(),
      JSON.stringify(responseData),
      JSON.stringify(context.console.getLogs())
    ])

    // Update function execution stats
    await database.query(`
      UPDATE functions 
      SET execution_count = execution_count + 1,
          last_executed = $2
      WHERE id = $1
    `, [functionData.id, new Date()])

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
          request_method, request_url, executed_at, response_body, console_logs
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `
      
      await database.query(logQuery, [
        functionData.id,
        500,
        executionTime,
        'SCHEDULED',
        '/scheduled',
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
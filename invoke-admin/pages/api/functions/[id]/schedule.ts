import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { Pool } from 'pg'
import { CronJob } from 'cron'

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'invoke_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'invoke_password_123'
})

// Utility function to calculate next execution time based on cron expression
function calculateNextExecution(cronExpression: string): Date | null {
  try {
    // Use cron library for accurate parsing
    const job = new CronJob(cronExpression, function() {})
    const next = job.nextDate().toJSDate() // Convert to JavaScript Date object
    
    console.log(`Admin UI: Cron expression "${cronExpression}" next execution: ${next.toString()}`)
    return next
    
  } catch (error) {
    console.error(`Admin UI: Error parsing cron expression "${cronExpression}":`, error.message)
    return null
  }
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string }

    if (!id) {
      return res.status(400).json({ error: 'Function ID is required' })
    }

    const client = await pool.connect()
    
    try {
      if (req.method === 'GET') {
        // Get current schedule settings
        const result = await client.query(`
          SELECT schedule_enabled, schedule_cron, next_execution, last_scheduled_execution
          FROM functions 
          WHERE id = $1
        `, [id])

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Function not found' })
        }

        res.json({
          success: true,
          data: result.rows[0]
        })

      } else if (req.method === 'PUT') {
        // Update schedule settings
        const { schedule_enabled, schedule_cron } = req.body

        if (schedule_enabled && !schedule_cron) {
          return res.status(400).json({ error: 'Cron expression is required when scheduling is enabled' })
        }

        let next_execution = null
        if (schedule_enabled && schedule_cron) {
          next_execution = calculateNextExecution(schedule_cron)
          if (!next_execution) {
            return res.status(400).json({ error: 'Invalid cron expression' })
          }
        }

        const result = await client.query(`
          UPDATE functions 
          SET schedule_enabled = $2, 
              schedule_cron = $3, 
              next_execution = $4,
              updated_at = NOW()
          WHERE id = $1
          RETURNING schedule_enabled, schedule_cron, next_execution
        `, [id, schedule_enabled, schedule_cron, next_execution])

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Function not found' })
        }

        res.json({
          success: true,
          message: 'Schedule settings updated successfully',
          data: result.rows[0]
        })

      } else {
        res.status(405).json({ error: 'Method not allowed' })
      }

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Schedule API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)
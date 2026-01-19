import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'

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
    // Simple cron parser for minute-level expressions (e.g., "*/5 * * * *" for every 5 minutes)
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' })
    }

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
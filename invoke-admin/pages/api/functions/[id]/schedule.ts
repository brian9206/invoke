import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { CronJob } from 'cron'
const database = require('@/lib/database')

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

    const { FunctionModel } = database.models;

    if (req.method === 'GET') {
      // Get current schedule settings
      const fn = await FunctionModel.findByPk(id, {
        attributes: ['schedule_enabled', 'schedule_cron', 'next_execution', 'last_scheduled_execution']
      });

      if (!fn) {
        return res.status(404).json({ error: 'Function not found' })
      }

      res.json({
        success: true,
        data: fn.get({ plain: true })
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

      const [affectedCount, updatedRows] = await FunctionModel.update(
        {
          schedule_enabled,
          schedule_cron,
          next_execution,
          updated_at: new Date()
        },
        { where: { id }, returning: true }
      );

      if (affectedCount === 0) {
        return res.status(404).json({ error: 'Function not found' })
      }

      const updated = updatedRows[0].get({ plain: true });
      res.json({
        success: true,
        message: 'Schedule settings updated successfully',
        data: {
          schedule_enabled: updated.schedule_enabled,
          schedule_cron: updated.schedule_cron,
          next_execution: updated.next_execution
        }
      })

    } else {
      res.status(405).json({ error: 'Method not allowed' })
    }

  } catch (error) {
    console.error('Schedule API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PUT'])(handler)
import { NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { CronJob } from 'cron'

function calculateNextExecution(cronExpression: string): Date | null {
  try {
    const job = new CronJob(cronExpression, function() {})
    return job.nextDate().toJSDate()
  } catch {
    return null
  }
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { schedule_cron } = req.body || {}

    if (!schedule_cron || typeof schedule_cron !== 'string' || !schedule_cron.trim()) {
      return res.status(400).json({ error: 'Cron expression is required' })
    }

    const nextExecution = calculateNextExecution(schedule_cron)
    if (!nextExecution) {
      return res.status(400).json({ error: 'Invalid cron expression' })
    }

    return res.json({
      success: true,
      data: {
        next_execution: nextExecution,
      },
    })
  } catch (error) {
    console.error('Schedule preview API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withAuthOrApiKeyAndMethods(['POST'])(handler)

import express, { Request, Response } from 'express'
import { getMetrics } from '../services/execution-service'

const router = express.Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = getMetrics()
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Metrics] Error retrieving metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      message: error.message
    })
  }
})

export default router

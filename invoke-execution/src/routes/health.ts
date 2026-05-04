import express, { Request, Response } from 'express'
import os from 'os'
import { Op } from 'sequelize'
import database from '../services/database'
import { s3Service } from 'invoke-shared'
import cache from '../services/cache'

const router = express.Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    await database.sequelize.authenticate()

    let minioStatus = 'unknown'
    try {
      await s3Service.listBuckets()
      minioStatus = 'connected'
    } catch {
      minioStatus = 'disconnected'
    }

    let cacheStatus = 'unknown'
    try {
      await cache.getCacheStats()
      cacheStatus = 'operational'
    } catch {
      cacheStatus = 'error'
    }

    res.status(200).json({
      status: 'healthy',
      service: 'invoke-execution',
      timestamp: new Date().toISOString(),
      database: 'connected',
      minio: minioStatus,
      cache: cacheStatus
    })
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'invoke-execution',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    })
  }
})

router.get('/detailed', async (_req: Request, res: Response): Promise<void> => {
  try {
    let s3Info: Record<string, any> = { status: 'unknown' }
    try {
      const buckets = await s3Service.listBuckets()
      s3Info = {
        status: 'connected',
        buckets: buckets.map((b: any) => b.Name)
      }
    } catch (error: any) {
      s3Info = { status: 'disconnected', error: error.message }
    }

    let cacheInfo: Record<string, any> = { status: 'unknown' }
    try {
      const stats = await cache.getCacheStats()
      cacheInfo = { status: 'operational', stats }
    } catch (error: any) {
      cacheInfo = { status: 'error', error: error.message }
    }

    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage(),
        total: os.totalmem(),
        free: os.freemem()
      },
      cpu: {
        count: os.cpus().length,
        loadAvg: os.loadavg()
      }
    }

    res.status(200).json({
      status: 'healthy',
      service: 'invoke-execution',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'connected' },
        s3: s3Info,
        cache: cacheInfo,
        system: systemInfo
      }
    })
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'invoke-execution',
      timestamp: new Date().toISOString(),
      error: error.message
    })
  }
})

export default router

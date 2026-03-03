import express, { Request, Response } from 'express';
import routeCache from '../services/route-cache';
import database from '../services/database';

const router = express.Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await database.sequelize.authenticate();
    const cacheStatus = routeCache.getStatus();
    res.json({
      status: 'ok',
      service: 'invoke-gateway',
      cache: {
        lastRefreshed: cacheStatus.lastRefreshed,
        projectCount: cacheStatus.projectCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: 'error', message });
  }
});

export default router;

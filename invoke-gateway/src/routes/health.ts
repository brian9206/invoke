import express, { Request, Response } from 'express';
import database from '../services/database';

const router = express.Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await database.sequelize.authenticate();
    res.json({ status: 'ok', service: 'invoke-gateway' });
  } catch (err) {
    res.status(503).json({ status: 'error' });
  }
});

export default router;

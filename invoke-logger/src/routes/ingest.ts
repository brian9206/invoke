import { Router, Request, Response } from 'express';
import { dbInsertLog } from '../services/db-logger';

const router = Router();

router.post('/log', async (req: Request, res: Response) => {
  try {
    const { project, function: functionArg, type, source, payload, executedAt } = req.body;
    await dbInsertLog({
      project,
      function: functionArg,
      type,
      source,
      payload,
      executedAt: executedAt ? new Date(executedAt as string) : undefined,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Logger] Failed to insert log:', message);
    res.status(500).json({ success: false, message });
  }
});

export default router;

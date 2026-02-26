const express = require('express');
const { getStatus } = require('../services/route-cache');
const { isConnected } = require('../services/pg-notify-listener');
const database = require('../services/database');

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    await database.query('SELECT 1');
    const cacheStatus = getStatus();
    res.json({
      status: 'ok',
      service: 'invoke-gateway',
      cache: {
        lastRefreshed: cacheStatus.lastRefreshed,
        projectCount: cacheStatus.projectCount,
        notifyConnected: isConnected(),
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

module.exports = router;

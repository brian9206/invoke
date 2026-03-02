const express = require('express');
const { getStatus } = require('../services/route-cache');
const database = require('../services/database');

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    await database.sequelize.authenticate();
    const cacheStatus = getStatus();
    res.json({
      status: 'ok',
      service: 'invoke-gateway',
      cache: {
        lastRefreshed: cacheStatus.lastRefreshed,
        projectCount: cacheStatus.projectCount,
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

module.exports = router;

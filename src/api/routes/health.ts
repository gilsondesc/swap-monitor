// src/api/routes/health.ts
// Health check endpoint para monitoramento de infraestrutura / PM2 / Nginx / Docker
import { Router } from 'express';
import { getDb } from '../../database/db';
import { config } from '../../config/config';

const router = Router();

router.get('/', (_req, res) => {
  let dbStatus = 'ok';
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  const isHealthy = dbStatus === 'ok';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    database: dbStatus,
  });
});

export default router;

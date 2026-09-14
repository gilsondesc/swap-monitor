// src/api/routes/status.ts
import { Router } from 'express';
import { getDb } from '../../database/db';
import { config } from '../../config/config';

const router = Router();

router.get('/', (_req, res) => {
  let dbOk = false;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  res.json({
    status: 'running',
    version: '1.0.0',
    mockMode: config.mockMode,
    monitorAmount: config.monitorAmount,
    quoteIntervalSeconds: config.quoteIntervalSeconds,
    swap: config.swap,
    database: dbOk ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
  });
});

export default router;

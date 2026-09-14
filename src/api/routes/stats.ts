// src/api/routes/stats.ts
import { Router } from 'express';
import { getAllProvidersStats } from '../../services/statistics.service';

const router = Router();

router.get('/', (_req, res) => {
  const stats = getAllProvidersStats(['sideshift', 'deflow']);
  res.json({ stats, timestamp: new Date().toISOString() });
});

export default router;

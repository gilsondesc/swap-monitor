// src/api/routes/comparison.ts
import { Router } from 'express';
import { getAllProvidersStats } from '../../services/statistics.service';
import { compareBestProvider } from '../../services/comparison.service';
import { calculateScore } from '../../services/scoring.service';

const router = Router();

router.get('/', (_req, res) => {
  const providers = ['sideshift', 'deflow'];
  const stats = getAllProvidersStats(providers);
  const comparison = compareBestProvider(stats);

  const enriched = stats.map((s) => {
    if (s.latest_quoted_amount === null) return { ...s, score: null };
    const scoreResult = calculateScore(
      s.latest_quoted_amount,
      s.average_1h,
      s.average_6h,
      s.average_24h,
      s.best_24h,
    );
    return { ...s, score: scoreResult };
  });

  res.json({ comparison, providers: enriched, timestamp: new Date().toISOString() });
});

export default router;

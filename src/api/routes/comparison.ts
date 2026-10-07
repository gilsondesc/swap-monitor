// src/api/routes/comparison.ts
import { Router } from 'express';
import { getAllActiveRoutesStats, getAllProvidersStats } from '../../services/statistics.service';
import { compareBestRoute, compareBestProvider } from '../../services/comparison.service';
import { calculateScore } from '../../services/scoring.service';

const router = Router();

router.get('/', (_req, res) => {
  const routes = getAllActiveRoutesStats();
  const routeComparison = compareBestRoute(routes);

  const enrichedRoutes = routes.map((r) => {
    if (r.latest_quoted_amount === null) return { ...r, score: null };
    const scoreResult = calculateScore(
      r.latest_quoted_amount,
      r.average_1h,
      r.average_6h,
      r.average_24h,
      r.best_24h,
    );
    return { ...r, score: scoreResult };
  });

  // Mantido para compatibilidade com qualquer cliente legado
  const providers = ['sideshift', 'deflow'];
  const providerStats = getAllProvidersStats(providers);
  const providerComparison = compareBestProvider(providerStats);
  const enrichedProviders = providerStats.map((s) => {
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

  res.json({
    comparison: routeComparison.best_route ? routeComparison : providerComparison,
    routeComparison,
    routes: enrichedRoutes,
    providers: enrichedProviders,
    timestamp: new Date().toISOString(),
  });
});

export default router;

// src/api/routes/quotes.ts
import { Router } from 'express';
import { getLatestQuotes, getQuotesHistory } from '../../database/db';

const router = Router();

// GET /api/quotes/latest
router.get('/latest', (_req, res) => {
  const quotes = getLatestQuotes();
  res.json({ quotes, count: quotes.length });
});

// GET /api/quotes/history?hours=24&provider=sideshift&network=solana&asset=USDG&limit=100
router.get('/history', (req, res) => {
  const hours = parseInt(req.query['hours'] as string) || 24;
  const provider = req.query['provider'] as string | undefined;
  const network = req.query['network'] as string | undefined;
  const asset = req.query['asset'] as string | undefined;
  const limit = Math.min(parseInt(req.query['limit'] as string) || 200, 1000);

  let history = getQuotesHistory(hours, { provider, network, asset });
  history = history.slice(0, limit);

  res.json({ history, count: history.length, hours, network, asset });
});

export default router;

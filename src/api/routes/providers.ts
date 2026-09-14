// src/api/routes/providers.ts
import { Router } from 'express';
import { getAllProviders } from '../../database/db';

const router = Router();

router.get('/', (_req, res) => {
  const providers = getAllProviders();
  res.json({ providers });
});

export default router;

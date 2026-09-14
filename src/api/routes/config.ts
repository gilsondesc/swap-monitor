// src/api/routes/config.ts
// Expõe config pública — NUNCA expõe secrets
import { Router } from 'express';
import { config } from '../../config/config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    mockMode: config.mockMode,
    monitorAmount: config.monitorAmount,
    quoteIntervalSeconds: config.quoteIntervalSeconds,
    swap: config.swap,
    providers: {
      sideshift: { enabled: config.sideshift.enabled },
      deflow: { enabled: config.deflow.enabled },
    },
    alerts: {
      telegram: { enabled: config.telegram.enabled },
    },
  });
});

export default router;

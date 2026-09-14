// src/api/routes/alerts.ts
import { Router } from 'express';
import { config } from '../../config/config';
import { testTelegramConnection } from '../../alerts/telegram';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    enabled: config.telegram.enabled,
    configured: Boolean(config.telegram.botToken && config.telegram.chatId),
    alertScoreThreshold: config.telegram.alertScoreThreshold,
    alertDiffThreshold: config.telegram.alertDiffThreshold,
  });
});

router.post('/test', async (req, res) => {
  const { botToken, chatId } = req.body || {};
  const result = await testTelegramConnection(botToken, chatId);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;

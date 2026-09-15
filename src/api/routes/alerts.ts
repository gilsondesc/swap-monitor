// src/api/routes/alerts.ts
import { Router } from 'express';
import { config } from '../../config/config';
import { testTelegramConnection } from '../../alerts/telegram';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    enabled: config.telegram.enabled,
    configured: Boolean(config.telegram.botToken && config.telegram.chatId),
    cooldownMinutes: config.telegram.cooldownMinutes,
    minImprovementPercent: config.telegram.minImprovementPercent,
    historyHours: config.telegram.historyHours,
  });
});

router.post('/test', async (req, res) => {
  const { botToken, chatId } = req.body || {};
  const result = await testTelegramConnection(botToken, chatId);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;

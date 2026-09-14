// src/api/server.ts
import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import healthRouter from './routes/health';
import statusRouter from './routes/status';
import providersRouter from './routes/providers';
import quotesRouter from './routes/quotes';
import comparisonRouter from './routes/comparison';
import statsRouter from './routes/stats';
import configRouter from './routes/config';
import alertsRouter from './routes/alerts';

/**
 * Localiza o diretório do dashboard de forma resiliente
 * Funciona tanto em desenvolvimento (tsx / src) quanto em produção (dist)
 */
export function resolveDashboardPath(): string {
  // 1. dist/dashboard (quando compilado com scripts/copy-assets.js)
  const distDashboard = path.join(__dirname, '..', 'dashboard');
  if (fs.existsSync(path.join(distDashboard, 'index.html'))) {
    return distDashboard;
  }
  // 2. src/dashboard a partir do cwd
  const srcDashboard = path.join(process.cwd(), 'src', 'dashboard');
  if (fs.existsSync(path.join(srcDashboard, 'index.html'))) {
    return srcDashboard;
  }
  // 3. Fallback relativo a __dirname
  return path.join(__dirname, '..', '..', 'src', 'dashboard');
}

export function createServer(): express.Express {
  const app = express();

  // Segurança: Remove cabeçalho X-Powered-By
  app.disable('x-powered-by');

  app.use(express.json());

  // CORS configurável
  app.use((_req, res, next) => {
    const origin = config.corsOrigin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check endpoints (disponíveis tanto na raiz quanto em /api)
  app.use('/health',     healthRouter);
  app.use('/api/health', healthRouter);

  // Rotas da API
  app.use('/api/status',     statusRouter);
  app.use('/api/providers',  providersRouter);
  app.use('/api/quotes',     quotesRouter);
  app.use('/api/comparison', comparisonRouter);
  app.use('/api/stats',      statsRouter);
  app.use('/api/config',     configRouter);
  app.use('/api/alerts',     alertsRouter);

  // Dashboard — arquivos estáticos
  const dashboardPath = resolveDashboardPath();
  app.use(express.static(dashboardPath));

  // Fallback SPA para arquivos HTML não encontrados nas rotas de API
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      res.status(404).json({ error: 'Endpoint não encontrado' });
      return;
    }
    const indexPath = path.join(dashboardPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });

  // Middleware global de tratamento de erros — protege detalhes internos em produção
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('[SERVER] Erro não tratado na requisição:', err.message);
    res.status(500).json({
      error: config.isProduction ? 'Internal Server Error' : err.message,
    });
  });

  return app;
}

let _serverInstance: http.Server | null = null;

export function startServer(portToUse?: number): http.Server {
  const app = createServer();
  const port = portToUse ?? config.port;

  _serverInstance = app.listen(port, () => {
    logger.info(`[SERVER] Swap Monitor rodando em http://localhost:${port}`);
    logger.info(`[SERVER] Dashboard: http://localhost:${port}`);
    logger.info(`[SERVER] Health check: http://localhost:${port}/health`);
    logger.info(`[SERVER] API Status: http://localhost:${port}/api/status`);
  });

  return _serverInstance;
}

export function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (_serverInstance) {
      _serverInstance.close(() => {
        logger.info('[SERVER] Servidor HTTP encerrado com sucesso');
        _serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

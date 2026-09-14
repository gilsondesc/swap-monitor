#!/usr/bin/env bash
# ============================================================
# scripts/deploy.sh — Script de Deploy Futuro para VPS Linux
# ============================================================
# ATENÇÃO: Este script é SOMENTE para preparação de futuro deploy.
# NÃO deve ser executado no ambiente local de desenvolvimento.
# Atua EXCLUSIVAMENTE em /root/swap-monitor.
# NUNCA altera ou reinicia o projeto Gerenciador (/root/automacao).
# ============================================================

set -euo pipefail

TARGET_DIR="/root/swap-monitor"

# Validação estrita de diretório para evitar acidentes
CURRENT_DIR="$(pwd)"
if [ "$CURRENT_DIR" != "$TARGET_DIR" ]; then
  echo "[DEPLOY ERROR] O script deve ser executado exclusivamente em $TARGET_DIR"
  echo "[DEPLOY ERROR] Diretório atual: $CURRENT_DIR"
  exit 1
fi

echo "============================================================"
echo "    Iniciando Deploy do Swap Monitor — /root/swap-monitor"
echo "============================================================"

# 1. Atualizar código via Git
echo "[1/5] Atualizando código do repositório..."
git pull origin main

# 2. Instalar dependências completas (necessárias para build com TypeScript)
echo "[2/5] Instalando dependências (npm ci)..."
npm ci

# 3. Compilar aplicação TypeScript e copiar assets do dashboard
echo "[3/5] Executando build de produção..."
npm run build

# 4. Recarregar processo no PM2 (apenas swap-monitor)
echo "[4/5] Recarregando swap-monitor no PM2..."
if pm2 describe swap-monitor >/dev/null 2>&1; then
  pm2 reload swap-monitor --update-env
else
  pm2 start ecosystem.config.js
fi

# 5. Verificação de integridade via Health Check
echo "[5/5] Validando health check..."
sleep 2

# Carrega PORT do .env se existir, padrão 3100
PORT_VAL="3100"
if [ -f .env ]; then
  ENV_PORT=$(grep -E '^PORT=' .env | cut -d '=' -f2 | tr -d ' ' || true)
  if [ -n "$ENV_PORT" ]; then
    PORT_VAL="$ENV_PORT"
  fi
fi

HEALTH_URL="http://127.0.0.1:${PORT_VAL}/health"
if command -v curl >/dev/null 2>&1; then
  HEALTH_RESP=$(curl -s -f "$HEALTH_URL" || echo "failed")
  if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
    echo "[DEPLOY SUCCESS] Health check OK em $HEALTH_URL!"
  else
    echo "[DEPLOY WARN] Health check retornou resposta inesperada: $HEALTH_RESP"
  fi
fi

echo "============================================================"
echo "    Deploy do Swap Monitor concluído com sucesso!"
echo "============================================================"

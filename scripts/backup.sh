#!/usr/bin/env bash
# ============================================================
# scripts/backup.sh — Backup Seguro do SQLite (WAL Mode)
# ============================================================
# Exclusivo para o Swap Monitor — Não interfere em outros projetos
# ============================================================

set -euo pipefail

PROJECT_DIR="/root/swap-monitor"
if [ ! -d "$PROJECT_DIR" ]; then
  PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

cd "$PROJECT_DIR"

DB_FILE="${DATABASE_PATH:-./data/swap-monitor.db}"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/monitor_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[BACKUP ERROR] Banco de dados não encontrado: $DB_FILE"
  exit 1
fi

echo "[BACKUP] Iniciando backup consistente com WAL..."
echo "[BACKUP] Origem:  $DB_FILE"
echo "[BACKUP] Destino: $BACKUP_FILE"

# Método 1: sqlite3 CLI oficial .backup (garante consistência com WAL em execução)
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
  echo "[BACKUP] Sucesso via sqlite3 .backup"
else
  # Método 2: Node.js nativo 22+ com VACUUM INTO
  node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('$DB_FILE');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM INTO \'$BACKUP_FILE\'');
    db.close();
  "
  echo "[BACKUP] Sucesso via Node.js VACUUM INTO"
fi

# Compactação opcional
if command -v gzip >/dev/null 2>&1; then
  gzip -f "$BACKUP_FILE"
  echo "[BACKUP] Arquivo compactado: ${BACKUP_FILE}.gz"
fi

# Política de retenção: remover backups com mais de 30 dias (restrito a swap-monitor/backups)
echo "[BACKUP] Aplicando política de retenção (30 dias)..."
find "$BACKUP_DIR" -name "monitor_*.db*" -type f -mtime +30 -delete

echo "[BACKUP] Backup finalizado com sucesso."

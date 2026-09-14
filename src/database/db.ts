// src/database/db.ts
// Usa o módulo SQLite nativo do Node.js 22+ (node:sqlite)
// Não requer instalação de pacotes nativos nem compilação
import path from 'path';
import fs from 'fs';
import { config } from '../config/config';
import {
  CREATE_PROVIDERS_TABLE,
  CREATE_QUOTES_TABLE,
  CREATE_EXECUTIONS_MANUAL_TABLE,
  CREATE_INDEXES,
} from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseSyncClass: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DatabaseSyncClass = require('node:sqlite').DatabaseSync;
} catch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSyncClass = class {
    constructor() {
      throw new Error('O módulo nativo node:sqlite requer Node.js >= 22.5.0');
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseSync = any;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dbPath = config.databasePath;
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new DatabaseSyncClass(dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  runMigrations(_db);

  return _db;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(CREATE_PROVIDERS_TABLE);
  db.exec(CREATE_QUOTES_TABLE);
  db.exec(CREATE_EXECUTIONS_MANUAL_TABLE);
  for (const idx of CREATE_INDEXES) {
    db.exec(idx);
  }
  seedProviders(db);
}

function seedProviders(db: DatabaseSync): void {
  const upsert = db.prepare(`
    INSERT INTO providers (name, enabled, status)
    VALUES (?, ?, 'unknown')
    ON CONFLICT(name) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = datetime('now')
  `);

  upsert.run('sideshift', config.sideshift.enabled ? 1 : 0);
  upsert.run('deflow', config.deflow.enabled ? 1 : 0);
}

// ----------------------------------------------------------------
// Helpers de escrita
// ----------------------------------------------------------------

export interface QuoteRow {
  id?: number;
  provider: string;
  source_asset: string;
  source_network: string;
  destination_asset: string;
  destination_network: string;
  source_amount: number;
  quoted_amount: number | null;
  effective_rate: number | null;
  minimum_amount: number | null;
  maximum_amount: number | null;
  network_fee: number | null;
  service_fee: number | null;
  quote_type: string | null;
  quote_id: string | null;
  raw_response: string | null;
  success: 0 | 1;
  error_message: string | null;
  observed_at?: string;
}

export function insertQuote(row: QuoteRow): number {
  const db = getDb();
  const observed_at = row.observed_at ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO quotes (
      provider, source_asset, source_network,
      destination_asset, destination_network,
      source_amount, quoted_amount, effective_rate,
      minimum_amount, maximum_amount,
      network_fee, service_fee,
      quote_type, quote_id,
      raw_response, success, error_message,
      observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    row.provider, row.source_asset, row.source_network,
    row.destination_asset, row.destination_network,
    row.source_amount, row.quoted_amount, row.effective_rate,
    row.minimum_amount, row.maximum_amount,
    row.network_fee, row.service_fee,
    row.quote_type, row.quote_id,
    row.raw_response, row.success, row.error_message,
    observed_at,
  );

  return Number(result.lastInsertRowid);
}

export function updateProviderStatus(
  name: string,
  status: string,
  lastError: string | null = null,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE providers SET
      status = ?,
      last_check_at = datetime('now'),
      last_error = ?,
      updated_at = datetime('now')
    WHERE name = ?
  `).run(status, lastError, name);
}

// ----------------------------------------------------------------
// Helpers de leitura
// ----------------------------------------------------------------

export function getLatestQuotes(): QuoteRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT q.*
    FROM quotes q
    INNER JOIN (
      SELECT provider, MAX(observed_at) AS max_observed
      FROM quotes
      GROUP BY provider
    ) latest ON q.provider = latest.provider AND q.observed_at = latest.max_observed
    ORDER BY q.provider
  `).all() as unknown as QuoteRow[];
}

export function getQuotesHistory(
  hours: number,
  provider?: string,
): QuoteRow[] {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  if (provider) {
    return db.prepare(`
      SELECT * FROM quotes
      WHERE provider = ? AND observed_at >= ? AND success = 1
      ORDER BY observed_at DESC
    `).all(provider, since) as unknown as QuoteRow[];
  }

  return db.prepare(`
    SELECT * FROM quotes
    WHERE observed_at >= ? AND success = 1
    ORDER BY observed_at DESC
  `).all(since) as unknown as QuoteRow[];
}

export function getAllProviders() {
  return getDb().prepare('SELECT * FROM providers ORDER BY name').all();
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

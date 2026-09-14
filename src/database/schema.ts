// src/database/schema.ts
// Definições das tabelas SQLite

export const CREATE_PROVIDERS_TABLE = `
CREATE TABLE IF NOT EXISTS providers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  enabled     INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'unknown',
  last_check_at TEXT,
  last_error  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_QUOTES_TABLE = `
CREATE TABLE IF NOT EXISTS quotes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  provider             TEXT    NOT NULL,
  source_asset         TEXT    NOT NULL,
  source_network       TEXT    NOT NULL,
  destination_asset    TEXT    NOT NULL,
  destination_network  TEXT    NOT NULL,
  source_amount        REAL    NOT NULL,
  quoted_amount        REAL,
  effective_rate       REAL,
  minimum_amount       REAL,
  maximum_amount       REAL,
  network_fee          REAL,
  service_fee          REAL,
  quote_type           TEXT,
  quote_id             TEXT,
  raw_response         TEXT,
  success              INTEGER NOT NULL DEFAULT 0,
  error_message        TEXT,
  observed_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_EXECUTIONS_MANUAL_TABLE = `
CREATE TABLE IF NOT EXISTS executions_manual (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider       TEXT    NOT NULL,
  source_amount  REAL    NOT NULL,
  quoted_amount  REAL,
  actual_received REAL,
  difference     REAL,
  txid           TEXT,
  timestamp      TEXT    NOT NULL DEFAULT (datetime('now')),
  notes          TEXT
);
`;

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_quotes_provider ON quotes(provider);`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_observed_at ON quotes(observed_at);`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_success ON quotes(success);`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_provider_observed ON quotes(provider, observed_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_pair_observed ON quotes(source_asset, destination_asset, observed_at DESC);`,
];

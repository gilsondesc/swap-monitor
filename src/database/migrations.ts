// src/database/migrations.ts
// Script standalone para inicializar o banco de dados
// Execute: npm run db:init
import 'dotenv/config';
import { getDb } from './db';

console.log('[DB] Inicializando banco SQLite...');
const db = getDb();
console.log('[DB] Banco inicializado com sucesso');
console.log('[DB] Tabelas criadas: providers, quotes, executions_manual');
db.close();

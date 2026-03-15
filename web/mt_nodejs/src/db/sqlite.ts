import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_FILE = path.resolve(__dirname, '../../data/alerts.sqlite');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

let db: SqlJsDatabase | null = null;
let SQL: any = null;

const initPromise = initSqlJs().then((SQLLib) => {
  SQL = SQLLib;
  let data: Uint8Array | null = null;
  if (fs.existsSync(DB_FILE)) {
    data = new Uint8Array(fs.readFileSync(DB_FILE));
  }
  db = data ? new SQL.Database(data) : new SQL.Database();

  db.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    target_price REAL NOT NULL,
    direction TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  persist();
  return db;
});

function persist() {
  if (!db) return;
  const out = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(out));
}

export async function ready() {
  await initPromise;
  return db as SqlJsDatabase;
}

export function prepare(sql: string) {
  if (!db) throw new Error('DB not initialized');
  return db.prepare(sql);
}

export function run(sql: string, params?: any[]) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
  persist();
}

export function all(sql: string, params?: any[]) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function get(sql: string, params?: any[]) {
  const rows = all(sql, params);
  return rows[0] ?? null;
}

export default {
  ready,
  prepare,
  run,
  all,
  get,
};

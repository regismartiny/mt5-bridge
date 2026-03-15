import db from '../db/sqlite';

export type Direction = 'above' | 'below';
export type Alert = {
  id?: number;
  symbol: string;
  target_price: number;
  direction: Direction;
  active?: number;
  created_at?: string;
};

export type AlertEvent = {
  id?: number;
  alert_id?: number | null;
  symbol: string;
  price: number;
  event_type: string;
  created_at?: string;
};

export const createAlert = async (a: Alert): Promise<Alert> => {
  await db.ready();
  const sql = `INSERT INTO alerts (symbol, target_price, direction, active) VALUES (?, ?, ?, ?)`;
  db.run(sql, [a.symbol, a.target_price, a.direction, a.active ?? 1]);
  const created = db.get(`SELECT * FROM alerts ORDER BY id DESC LIMIT 1`);
  return created as Alert;
};

export const listAlerts = async (activeOnly = false): Promise<Alert[]> => {
  await db.ready();
  if (activeOnly) {
    return db.all(`SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC`);
  }
  return db.all(`SELECT * FROM alerts ORDER BY created_at DESC`);
};

export const getAlert = async (id: number): Promise<Alert | null> => {
  await db.ready();
  return db.get(`SELECT * FROM alerts WHERE id = ?`, [id]) as Alert | null;
};

export const deleteAlert = async (id: number): Promise<boolean> => {
  await db.ready();
  const infoSql = `DELETE FROM alerts WHERE id = ?`;
  db.run(infoSql, [id]);
  return true;
};

export const checkAlertsForPrice = async (symbol: string, price: number): Promise<AlertEvent[]> => {
  await db.ready();
  const activeAlerts = db.all(`SELECT * FROM alerts WHERE symbol = ? AND active = 1`, [symbol]) as Alert[];
  const triggered: AlertEvent[] = [];

  for (const a of activeAlerts) {
    let crossed = false;
    if (a.direction === 'above' && price >= a.target_price) crossed = true;
    if (a.direction === 'below' && price <= a.target_price) crossed = true;

    if (crossed) {
      db.run(`INSERT INTO alert_events (alert_id, symbol, price, event_type) VALUES (?, ?, ?, ?)` , [a.id, symbol, price, 'triggered']);
      db.run(`UPDATE alerts SET active = 0 WHERE id = ?`, [a.id]);
      triggered.push({ alert_id: a.id, symbol, price, event_type: 'triggered' });
    }
  }

  return triggered;
};

export const handlePriceUpdate = async (symbol: string, price: number): Promise<AlertEvent[]> => {
  return await checkAlertsForPrice(symbol, price);
};

export default {
  createAlert,
  listAlerts,
  getAlert,
  deleteAlert,
  handlePriceUpdate,
};

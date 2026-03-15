import WebSocket from 'ws';
import alertService from './alertService';
import { postTrackPrices } from './SocketBridgeApi';

const WS_URL = process.env.MT5_WS_URL || 'ws://127.0.0.1:8890';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function safeParse(data: WebSocket.Data) {
  try {
    const text = typeof data === 'string' ? data : data.toString();
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

async function onOpen() {
  console.log(`Connected to MT5 websocket at ${WS_URL}`);
  try {
    const alerts = await alertService.listAlerts(true);
    const symbols = Array.from(new Set(alerts.map((a) => a.symbol)));
    if (symbols.length) {
      try {
        await postTrackPrices({ symbols });
        console.log('Requested MT5 to track prices for:', symbols.join(', '));
      } catch (err) {
        console.error('Failed to request track/prices', err);
      }
    }
  } catch (err) {
    console.error('Error preparing track subscription:', err);
  }
}

async function onMessage(data: WebSocket.Data) {
  const msg = safeParse(data);
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'price_update') {
    const symbol = msg.symbol;
    const price = Number(msg.bid ?? msg.ask ?? NaN);
    if (!symbol || Number.isNaN(price)) return;

    try {
      const triggered = await alertService.handlePriceUpdate(symbol, price);
      if (triggered && triggered.length) {
        console.log('Alerts triggered for', symbol, triggered.length);
      }
    } catch (err) {
      console.error('Error handling price update', err);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 2000);
}

export function connect() {
  if (ws) {
    try {
      ws.removeAllListeners();
      ws.close();
    } catch (e) {
      // ignore
    }
    ws = null;
  }

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    onOpen();
  });

  ws.on('message', (data) => {
    onMessage(data);
  });

  ws.on('close', () => {
    console.warn('MT5 websocket connection closed, reconnecting...');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('MT5 websocket error:', err.message ?? err);
    try {
      ws?.close();
    } catch (e) {
      // ignore
    }
    scheduleReconnect();
  });
}

export default {
  connect,
};

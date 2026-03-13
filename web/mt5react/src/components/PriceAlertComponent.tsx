
import React, { useEffect, useState, useCallback } from "react";
import wsService from "../services/wsService";
import callAPI from "../services/apiCallService";

interface PriceAlert {
  symbol: string;
  price: number;
  condition: "above" | "below";
}

interface PriceUpdate {
  symbol: string;
  price: number;
}


// --- Subcomponents ---
type AlertListProps = {
  alerts: PriceAlert[];
  triggered: string[];
  onRemove: (idx: number) => void;
};

const AlertList: React.FC<AlertListProps> = ({ alerts, triggered, onRemove }) => (
  <ul className="mb-4 space-y-2">
    {alerts.map((alert, idx) => {
      const key = `${alert.symbol}-${alert.price}-${alert.condition}`;
      const isTriggered = triggered.includes(key);
      return (
        <li
          key={key}
          className={`flex items-center justify-between gap-2 px-4 py-2 rounded-xl border ${isTriggered ? 'border-red-500 bg-red-900/20 text-red-300' : 'border-blue-700/40 bg-slate-800/60 text-white'} shadow-sm`}
        >
          <span className="font-mono font-semibold">
            {alert.symbol} <span className="uppercase">{alert.condition}</span> <span className="font-bold">{alert.price}</span> {isTriggered && <span className="ml-2 animate-pulse text-red-400 font-bold">(Triggered!)</span>}
          </span>
          <button
            onClick={() => onRemove(idx)}
            className="ml-2 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow transition-colors"
          >
            Remove
          </button>
        </li>
      );
    })}
  </ul>
);

type AlertFormProps = {
  onAdd: (symbol: string, price: number, condition: "above" | "below") => Promise<void>;
};

const AlertForm: React.FC<AlertFormProps> = ({ onAdd }) => {
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || isNaN(Number(price))) return;
    await onAdd(symbol.trim().toUpperCase(), Number(price), condition);
    setSymbol("");
    setPrice("");
    setCondition("above");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 items-center bg-slate-900/60 p-4 rounded-xl border border-blue-700/30 shadow-inner mb-2">
      <input
        type="text"
        placeholder="Symbol"
        value={symbol}
        onChange={e => setSymbol(e.target.value)}
        required
        className="w-28 px-3 py-2 rounded-lg border border-blue-700/40 bg-slate-800 text-white placeholder-slate-400 font-mono uppercase focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
      />
      <input
        type="number"
        placeholder="Price"
        value={price}
        onChange={e => setPrice(e.target.value)}
        required
        className="w-28 px-3 py-2 rounded-lg border border-blue-700/40 bg-slate-800 text-white placeholder-slate-400 font-mono focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
      />
      <select
        value={condition}
        onChange={e => setCondition(e.target.value as "above" | "below")}
        className="px-3 py-2 rounded-lg border border-blue-700/40 bg-slate-800 text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
      >
        <option value="above">Above</option>
        <option value="below">Below</option>
      </select>
      <button
        type="submit"
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold shadow transition-all"
      >
        Add
      </button>
    </form>
  );
};


const PriceAlertComponent: React.FC = () => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [triggered, setTriggered] = useState<string[]>([]);

  // Memoize checkAlerts to avoid unnecessary re-renders
  const checkAlerts = useCallback((update: PriceUpdate) => {
    // console.log('[PriceAlert] Incoming price update:', update);
    setTriggered(prev => {
      let changed = false;
      const newTriggered = [...prev];
      alerts.forEach((alert) => {
        // console.log('[PriceAlert] Checking alert:', alert, 'against update:', update);
        if (
          alert.symbol === update.symbol &&
          ((alert.condition === "above" && update.price > alert.price) ||
            (alert.condition === "below" && update.price < alert.price))
        ) {
          const key = `${alert.symbol}-${alert.price}-${alert.condition}`;
          if (!newTriggered.includes(key)) {
            console.log(`[PriceAlert] Triggered alert:`, alert, 'with update:', update);
            newTriggered.push(key);
            changed = true;
          }
        }
      });
      if (!changed) {
        // console.log('[PriceAlert] No alerts triggered for update:', update);
      }
      return changed ? newTriggered : prev;
    });
  }, [alerts]);

  useEffect(() => {
    wsService.connect();
    const listener = (data: any) => {
    //   console.log('[PriceAlert] WS data received:', data);
      if (data && data.symbol && typeof data.bid === "number" && typeof data.ask === "number") {
        checkAlerts({ symbol: data.symbol, price: data.bid });
      } else {
        // console.log('[PriceAlert] Ignored WS data (missing symbol/price):', data);
      }
    };
    wsService.addListener(listener);
    return () => {
      wsService.removeListener(listener);
    };
    // eslint-disable-next-line
  }, [checkAlerts]);

  // Add alert handler
  const handleAddAlert = useCallback(async (symbol: string, price: number, condition: "above" | "below") => {
    await callAPI("track/prices", { symbols: [symbol] }, "Track Prices");
    setAlerts(prev => [
      ...prev,
      { symbol, price, condition }
    ]);
  }, []);

  // Remove alert handler
  const handleRemoveAlert = useCallback((idx: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== idx));
    // Optionally remove from triggered as well
  }, []);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 shadow-2xl border border-blue-800/30 w-full max-w-xl mx-auto backdrop-blur-sm overflow-hidden mt-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-r from-yellow-500 to-orange-400 rounded-xl shadow-lg">
          {/* Bell icon or similar */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Price Alerts</h2>
          <p className="text-yellow-200 text-xs">Get notified when price hits your target</p>
        </div>
      </div>

      <AlertForm onAdd={handleAddAlert} />
      <AlertList alerts={alerts} triggered={triggered} onRemove={handleRemoveAlert} />

      {/* Summary */}
      <div className="mt-6 bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-xl p-4 border border-yellow-700/30 backdrop-blur-sm">
        <h4 className="text-sm font-bold text-yellow-200 mb-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
          Active Alerts
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-yellow-100 text-xs">
          {alerts.length === 0 ? (
            <span className="text-yellow-300">No alerts set.</span>
          ) : (
            alerts.map((alert, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="font-mono">{alert.symbol} {alert.condition} {alert.price}</span>
                <span className={triggered.includes(`${alert.symbol}-${alert.price}-${alert.condition}`) ? 'text-red-400 font-bold' : ''}>
                  {triggered.includes(`${alert.symbol}-${alert.price}-${alert.condition}`) ? 'Triggered' : 'Pending'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceAlertComponent;

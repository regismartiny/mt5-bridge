
import React, { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { UserPriceAlerts } from '../../plugins/user-price-alerts/user-price-alerts';
import type { UserAlertInfo } from '../../plugins/user-price-alerts/user-price-alerts';
import { getHistoricalData } from '../api/nodejsApiClient.ts';
import { useState } from "react";
import wsService from '../services/wsService';
import callAPI from "../services/apiCallService.ts";

const TIMEFRAMES = [
    { value: 'M1', label: '1 Minute' },
    { value: 'M5', label: '5 Minutes' },
    { value: 'M15', label: '15 Minutes' },
    { value: 'H1', label: '1 Hour' },
    { value: 'H4', label: '4 Hours' },
    { value: 'D1', label: '1 Day' }
];

// Helper map to get timeframe in seconds
const TIMEFRAME_SECONDS: Record<string, number> = {
    M1: 60,
    M5: 300,
    M15: 900,
    H1: 3600,
    H4: 14400,
    D1: 86400,
};

const TradingView: React.FC = () => {
    const firstContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<any>(null);
    const [symbol, setSymbol] = useState('BTCUSD');
    const [timeframe, setTimeframe] = useState('M1');
    const [fromDate, setFromDate] = useState('2026-03-12');
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Chart setup and responsive logic
    // Store last data for live updates
    const lastDataRef = useRef<any[]>([]);

    useEffect(() => {
        const container = firstContainerRef.current;
        if (!container) return;

        // Responsive resize
        const getResponsiveSize = () => {
            const width = container.parentElement?.offsetWidth || window.innerWidth;
            const height = Math.max(320, Math.round(window.innerHeight * 0.8));
            return { width, height };
        };
        const { width, height } = getResponsiveSize();
        const chartOptions =  { width, height, autoSize: true, timeScale: { timeVisible: true, secondsVisible: false }, 
            grid: { vertLines: { visible: false } , horzLines: { visible: false } }, 
            layout: { background: { type: ColorType.VerticalGradient, color: '#09010100' }, textColor: '#7c7979' } };
        const chart = createChart(container, chartOptions);
        chartRef.current = chart;

        const resizeObserver = new ResizeObserver(() => {
            chart.resize(width, height);
        });
        resizeObserver.observe(container.parentElement || container);

        // Add candlestick series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
        seriesRef.current = candlestickSeries;
        lastDataRef.current = [];

        // Attach price alert plugin
        const userPriceAlertsPrimitive = new UserPriceAlerts();
        userPriceAlertsPrimitive.setSymbolName(symbol);
        candlestickSeries.attachPrimitive(userPriceAlertsPrimitive);

        userPriceAlertsPrimitive.alertAdded().subscribe((alertInfo: UserAlertInfo) => {
            console.log(`➕ Alert added @ ${alertInfo.price} with the id: ${alertInfo.id}`);
        });
        userPriceAlertsPrimitive.alertRemoved().subscribe((id: string) => {
            console.log(`❌ Alert removed with the id: ${id}`);
        });

        // Track symbol for ohlc updates
        callAPI("track/ohlc", { ohlc: [{ symbol: symbol, time_frame: timeframe, depth: 3 }] }, "Track OHLC updates");

        // Track symbol for price updates
        callAPI("track/prices", { symbols: [symbol] }, "Track Price updates");

        // Real-time ohlc updates via wsService (must be top-level)
        wsService.connect();
        
        const ohlcUpdateListener = (data: any) => {
            if (!data || data.type !== 'ohlc_update' || !Array.isArray(data.bars)) return;
            // Only update if the incoming symbol/timeframe matches current view
            if (data.symbol !== symbol || data.timeframe !== timeframe) return;
            // If we have no existing data, we can't merge - just ignore updates until we have initial data
            if (!lastDataRef.current || lastDataRef.current.length === 0) return;

            console.log('OHLC update received:', data);
            try {
                const bars = data.bars.map((b: any) => {
                    let t: any = Date.parse(b.time);
                    return {
                        time: Number.isFinite(t) ? t : NaN,
                        open: b.open,
                        high: b.high,
                        low: b.low,
                        close: b.close,
                    };
                }).filter((x: any) => Number.isFinite(x.time));

                if (bars.length === 0) return;

                bars.sort((a: any, b: any) => a.time - b.time);

                const existing = lastDataRef.current || [];
                let merged: any[] = [];

                if (existing.length === 0) {
                    merged = bars;
                } else {
                    const firstIncoming = bars[0].time;
                    const prefix = existing.filter((d: any) => d.time < firstIncoming);
                    merged = [...prefix, ...bars];
                }

                lastDataRef.current = merged;
                if (seriesRef.current) {
                    seriesRef.current.setData(merged);
                }
            } catch (err) {
                console.error('Error applying OHLC update', err);
            }
        };

        const priceUpdateListener = (data: any) => {
            if (
                lastDataRef.current.length > 0 && 
                data && data.symbol && data.type == 'price_update' &&
                typeof data.bid === 'number' && data.bid > 0 &&
                typeof data.timestamp === 'number' && data.timestamp > 0
            ) {
                console.log('Price update received:', data);
                const lastData = lastDataRef.current[lastDataRef.current.length - 1];

                // Update last bar's close/high/low using bid/ask
                const updated = {
                    ...lastData,
                    close: data.bid,
                    high: Math.max(lastData.high, data.bid),
                    low: Math.min(lastData.low, data.bid),
                };
                lastDataRef.current[lastDataRef.current.length - 1] = updated;
                if (seriesRef.current) {
                    seriesRef.current.update(updated);
                }
            }
        };

        const statusChangeListener = (connected: boolean) => {
           if (!connected) {
               setError('WebSocket disconnected. Real-time updates may not work.');
           } else {
               setError(null);
           }
        };
        wsService.addStatusListener(statusChangeListener);
        wsService.addListener(ohlcUpdateListener);
        wsService.addListener(priceUpdateListener);
   
        return () => {
            chart.remove();
            resizeObserver.disconnect();
            wsService.removeListener(ohlcUpdateListener);
        };
    }, [symbol]);

    // Fetch and load data
    const fetchAndSetData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let endOfDayToDate = new Date(toDate);
            endOfDayToDate.setHours(23, 59, 59, 999);
            const endOfDayToDateStr = endOfDayToDate.toISOString().split('T')[0] + 'T23:59:59';
            
            const res = await getHistoricalData(symbol, fromDate, endOfDayToDateStr, timeframe);
            // lightweight-charts expects { time, open, high, low, close }
            let data = res.data.map((item: any) => {
                let t = Date.parse(item.time);
                return {
                    time: Number.isFinite(t) ? t : NaN,
                    open: item.open,
                    high: item.high,
                    low: item.low,
                    close: item.close,
                };
            });
            data = data.filter(d => Number.isFinite(d.time));
            data = data.sort((a, b) => a.time - b.time);
            lastDataRef.current = data;
            if (data.length === 0) {
                setError('No valid data to display.');
            }
            if (seriesRef.current) {
                seriesRef.current.setData(data);
                chartRef.current?.timeScale().fitContent();
                chartRef.current?.timeScale().scrollToPosition(5, true);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-full gap-8 w-full">
            <div className="w-full px-2">
                <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-50 rounded-lg border">
                    <div className="flex flex-col">
                        <label htmlFor="symbol" className="text-sm font-medium text-gray-700 mb-2">Symbol</label>
                        <input
                            id="symbol"
                            type="text"
                            value={symbol}
                            onChange={e => setSymbol(e.target.value.toUpperCase())}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-gray-900"
                            style={{color: '#111827'}}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="timeframe" className="text-sm font-medium text-gray-700 mb-2">Timeframe</label>
                        <select
                            id="timeframe"
                            value={timeframe}
                            onChange={e => setTimeframe(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm cursor-pointer text-gray-900"
                            style={{color: '#111827'}}
                        >
                            {TIMEFRAMES.map(tf => (
                                <option key={tf.value} value={tf.value}>{tf.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="fromDate" className="text-sm font-medium text-gray-700 mb-2">From Date</label>
                        <input
                            id="fromDate"
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-gray-900"
                            style={{color: '#111827'}}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="toDate" className="text-sm font-medium text-gray-700 mb-2">To Date</label>
                        <input
                            id="toDate"
                            type="date"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            min={fromDate}
                            max={new Date().toISOString().split('T')[0]}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-gray-900"
                            style={{color: '#111827'}}
                        />
                    </div>
                    <div className="flex flex-col justify-end">
                        <label className="text-sm font-medium text-gray-700 mb-2 invisible">Fetch</label>
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer font-sans"
                            style={{ minHeight: '40px' }}
                            onClick={fetchAndSetData}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Loading...' : 'Fetch Data'}
                        </button>
                    </div>
                </div>
                <div
                    ref={firstContainerRef}
                    id="firstContainer"
                    className="bg-white rounded shadow border w-full h-[80vh] min-h-[320px]"
                    style={{ minHeight: 320, height: '80vh', width: '100%' }}
                />
                {error && <div className="text-red-600 text-center mt-2">{error}</div>}
            </div>
        </div>
    );
};

export default TradingView;

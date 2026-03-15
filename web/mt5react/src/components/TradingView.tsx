
import React, { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { UserPriceAlerts } from '../../plugins/user-price-alerts/user-price-alerts';
import type { UserAlertInfo } from '../../plugins/user-price-alerts/user-price-alerts';
import { correctOHLCData, fetchHistoricalOHLC, fetchHistoricalOHLCBars } from '../services/dataFeedService';
import type { OHLCPoint } from '../services/dataFeedService';
import { useState } from "react";
import wsService from '../services/wsService';
import callAPI from "../services/apiCallService.ts";
import { TIMEFRAMES } from "../services/timeFrameUtilsService.ts";

const TradingView: React.FC = () => {
    const firstContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<any>(null);
    const [symbol, setSymbol] = useState('BTCUSD');
    const [timeframe, setTimeframe] = useState('M1');

    const formatDateTimeLocal = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const [fromDate, setFromDate] = useState<string>(formatDateTimeLocal(new Date(new Date().setHours(0, 0, 0, 0))));
    const [toDate, setToDate] = useState<string>(formatDateTimeLocal(new Date()));
    const [isLoading, setIsLoading] = useState(false);
    const [fitContent, setFitContent] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Chart setup and responsive logic
    // Store last data for live updates
    const lastDataRef = useRef<any[]>([]);
    const visibleRangeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const container = firstContainerRef.current;
        if (!container) return;
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Responsive resize
        const getResponsiveSize = () => {
            const width = container.parentElement?.offsetWidth || window.innerWidth;
            const height = Math.max(320, Math.round(window.innerHeight * 0.8));
            return { width, height };
        };
        const { width, height } = getResponsiveSize();

        // Create chart with responsive options
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

        // Add legend
        const legend = document.createElement('div');
        legend.style.cssText = 'position: absolute; left: 12px; top: 12px; z-index: 1; font-size: 14px; font-family: sans-serif; line-height: 18px; font-weight: 300;';
        container.appendChild(legend);

        const firstRow = document.createElement('div');
        firstRow.innerHTML = symbol;
        firstRow.style.color = '#a9a9a9';
        legend.appendChild(firstRow);

        chart.subscribeCrosshairMove(param => {
            let priceFormatted = '';
            if (param.time) {
                const data: any = param.seriesData.get(candlestickSeries);
                if (data) {
                    priceFormatted = `(O:${data.open} H:${data.high} L:${data.low} C:${data.close})`;
                }
            }
            firstRow.innerHTML = `${symbol} ${priceFormatted ? `<strong>${priceFormatted}</strong>` : ''}`;
        });

        // Infinite scroll logic (debounced)
        chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRange => {
            if (visibleRangeTimeoutRef.current) {
                window.clearTimeout(visibleRangeTimeoutRef.current);
            }
            visibleRangeTimeoutRef.current = window.setTimeout(async () => {
                console.log('Visible logical range changed:', logicalRange);
                if (logicalRange && logicalRange.from < 0) {
                    const numberBarsToLoad = Math.abs(Math.ceil(logicalRange.from));
                    const earliestTime = lastDataRef.current.length > 0 ? lastDataRef.current[0].time * 1000 : Date.now();
                    const earliestDate = new Date(earliestTime);
                    console.log(`Loading more data from ${earliestDate.toISOString()} (bars=${numberBarsToLoad})`);
                    try {
                        const data = await fetchHistoricalOHLCBars(symbol, earliestDate, numberBarsToLoad, timeframe);
                        mergeOHLCUpdates(data);
                    } catch (err) {
                        console.error('Failed to load historical bars', err);
                    }
                }
            }, 300);
        });

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

        const mergeOHLCUpdates = (updatedBars: OHLCPoint[]) => {
            try {
                console.log('Merging OHLC updates:', updatedBars);

                const existing = lastDataRef.current || [];
                let merged: OHLCPoint[] = [];

                if (existing.length === 0) {
                    merged = updatedBars;
                } else {
                    const lastIncoming = updatedBars[updatedBars.length - 1].time;
                    const firstExisting = existing[0].time;
                    const lastExisting = existing[existing.length - 1].time;
                    if (lastIncoming > lastExisting) {
                        // Append new bars at the end
                        const suffix = updatedBars.filter((d: any) => d.time > existing[existing.length - 1].time);
                        suffix.sort((a: any, b: any) => a.time - b.time);
                        merged = [...existing, ...suffix];
                    } else {
                        // Insert new bars at the beginning
                        const prefix = updatedBars.filter((d: any) => d.time < firstExisting);
                        prefix.sort((a: any, b: any) => a.time - b.time);
                        merged = [...prefix, ...updatedBars];
                    }
                }

                lastDataRef.current = merged;
                if (seriesRef.current) {
                    seriesRef.current.setData(merged);
                }
            } catch (err) {
                console.error('Error applying OHLC update', err);
            }
        };
        
        const ohlcUpdateListener = (data: any) => {
            if (!data || data.type !== 'ohlc_update' || !Array.isArray(data.bars)) return;
            // Only update if the incoming symbol/timeframe matches current view
            if (data.symbol !== symbol || data.timeframe !== timeframe) return;
            // If we have no existing data, we can't merge - just ignore updates until we have initial data
            if (!lastDataRef.current || lastDataRef.current.length === 0) return;

            console.log('OHLC update received:', data);
            const ohlcPoints = data.bars.map((item: any) => {
                const t = Date.parse(item.time);
                return {
                    time: Number.isFinite(t) ? t : NaN,
                    open: item.open,
                    high: item.high,
                    low: item.low,
                    close: item.close,
                } as OHLCPoint;
            });
            mergeOHLCUpdates(correctOHLCData(ohlcPoints));
        };

        const priceUpdateListener = (data: any) => {
            if (
                lastDataRef.current.length > 0 && 
                data && data.symbol && data.type == 'price_update' &&
                typeof data.bid === 'number' && data.bid > 0 &&
                typeof data.timestamp === 'number' && data.timestamp > 0
            ) {
                // console.log('Price update received:', data);
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
            if (visibleRangeTimeoutRef.current) {
                window.clearTimeout(visibleRangeTimeoutRef.current);
                visibleRangeTimeoutRef.current = null;
            }
            chart.remove();
            resizeObserver.disconnect();
            wsService.removeListener(ohlcUpdateListener);
            wsService.removeListener(priceUpdateListener);
            wsService.removeStatusListener(statusChangeListener);
        };
    }, [symbol, timeframe]);

    // Fetch and load data
    const fetchAndSetData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const endDate = new Date(toDate);

            const data = await fetchHistoricalOHLC(symbol, new Date(fromDate), endDate, timeframe);
            lastDataRef.current = data;
            if (data.length === 0) {
                setError('No valid data to display.');
            }
            if (seriesRef.current) {
                seriesRef.current.setData(data);
                if (fitContent) {
                    chartRef.current?.timeScale().fitContent();
                } else {
                    chartRef.current?.timeScale().scrollToPosition(5, true);
                }
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
                            type="datetime-local"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            max={formatDateTimeLocal(new Date())}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-gray-900"
                            style={{color: '#111827'}}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="toDate" className="text-sm font-medium text-gray-700 mb-2">To Date</label>
                        <input
                            id="toDate"
                            type="datetime-local"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            min={fromDate}
                            max={formatDateTimeLocal(new Date())}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-gray-900"
                            style={{color: '#111827'}}
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <input
                                id="fitContent"
                                type="checkbox"
                                checked={fitContent}
                                onChange={e => {
                                    const val = e.target.checked;
                                    setFitContent(val);
                                    if (val) {
                                        chartRef.current?.timeScale().fitContent();
                                    }
                                }}
                                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="fitContent" className="text-sm text-gray-700">Fit content</label>
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

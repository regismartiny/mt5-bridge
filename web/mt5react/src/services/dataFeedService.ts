
import { getHistoricalData } from '../api/nodejsApiClient';
import { getTimeframeInMs } from './timeFrameUtilsService';

const timezoneOffsetMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

export type OHLCPoint = { time: number; open: number; high: number; low: number; close: number };

export function correctOHLCData(data: OHLCPoint[]): OHLCPoint[] {
    return data.map(d => ({
        time: (d.time - timezoneOffsetMs) / 1000, // convert to seconds and adjust for timezone
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
    })).filter((x: any) => Number.isFinite(x.time)).sort((a, b) => a.time - b.time);
}

export async function fetchHistoricalOHLC(symbol: string, fromDate: Date, toDate: Date, timeframe: string): Promise<OHLCPoint[]> {
    function formatDateNoMs(d: Date): string {
        return d.toISOString().slice(0, 19);
    }
    // Adjust dates for timezone differences
    fromDate.setTime(fromDate.getTime() + timezoneOffsetMs);
    toDate.setTime(toDate.getTime() + timezoneOffsetMs);

    const fromDateStr = formatDateNoMs(fromDate);
    const toDateStr = formatDateNoMs(toDate);

    console.log(`Fetching historical data for ${symbol} from ${fromDateStr} to ${toDateStr} with timeframe ${timeframe}`);

    const res = await getHistoricalData(symbol, fromDateStr, toDateStr, timeframe);

    const ohlcPoints = res.data.map((item: any) => {
        const t = Date.parse(item.time);
        return {
            time: Number.isFinite(t) ? t : NaN,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
        } as OHLCPoint;
    });

    return correctOHLCData(ohlcPoints);
}

export async function fetchHistoricalOHLCBars(symbol: string, earliestDate: Date, bars: number, timeframe: string): Promise<OHLCPoint[]> {
    const fromDate = new Date(earliestDate.getTime() - bars * getTimeframeInMs(timeframe));
    return fetchHistoricalOHLC(symbol, fromDate, earliestDate, timeframe);
}
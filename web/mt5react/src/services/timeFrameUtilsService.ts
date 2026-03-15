
export const TIMEFRAMES = [
    { value: 'M1', label: '1 Minute' },
    { value: 'M5', label: '5 Minutes' },
    { value: 'M15', label: '15 Minutes' },
    { value: 'H1', label: '1 Hour' },
    { value: 'H4', label: '4 Hours' },
    { value: 'D1', label: '1 Day' }
];

export const getTimeFrameLabel = (value: string): string => {
    const tf = TIMEFRAMES.find(tf => tf.value === value);
    return tf ? tf.label : value;
}

export const getTimeframeInMs = (timeframe: string): number => {
    const unit = timeframe.slice(0, 1);
    const amount = parseInt(timeframe.slice(1), 10);
    console.log(`Calculating timeframe in ms for ${timeframe}: unit=${unit}, amount=${amount}`);
    switch (unit) {
        case 'M': return amount * 60 * 1000;
        case 'H': return amount * 60 * 60 * 1000;
        case 'D': return amount * 24 * 60 * 60 * 1000;
        default: throw new Error(`Unsupported timeframe unit: ${unit}`);
    }
}
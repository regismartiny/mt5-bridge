import { useEffect, useState, useRef } from "react";
import callAPI from "../services/apiCallService";
import wsService from "../services/wsService";

interface WsMessage {
    id: number;
    timestamp: string;
    data: any;
}

interface OHLCItem {
    time_frame: string;
    symbol: string;
    depth: number;
}

export default function MultiEndpointWsStreaming() {
// States for different endpoints
    const [symbolsInput, setSymbolsInput] = useState("");
    const [ohlcInput, setOhlcInput] = useState("");
    const [mbookInput, setMbookInput] = useState("");
    const [ordersEnabled, setOrdersEnabled] = useState(true);

    const [messages, setMessages] = useState<WsMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [activeTab, setActiveTab] = useState("prices");
    const messageIdRef = useRef(0);

    useEffect(() => {
        wsService.connect();

        const handleNewMessage = (data: any) => {
            messageIdRef.current += 1;
            const msg: WsMessage = {
                id: Date.now() + Math.random(),
                timestamp: new Date().toLocaleTimeString(),
                data,
            };
            setMessages((prev) => [msg, ...prev].slice(0, 100));
        };

        const handleStatusChange = (connected: boolean) => {
            setIsConnected(connected);
        };

        wsService.addListener(handleNewMessage);
        wsService.addStatusListener(handleStatusChange);
        setIsConnected(wsService.getConnectedStatus());

        return () => {
            wsService.removeListener(handleNewMessage);
            wsService.removeStatusListener(handleStatusChange);
        };
    }, []);

    // Handler for track/prices
    const handlePricesSubmit = async () => {
        const symbols = symbolsInput
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean);

        setMessages([]);
        await callAPI("track/prices", { symbols }, "Prices API");
    };

    // Handler for track/ohlc
    const handleOHLCSubmit = async () => {
        try {
            let ohlcData: OHLCItem[] = [];

            if (ohlcInput.trim()) {
                // Parse the input - expecting format like: M1,EURUSD,5|M5,GBPUSD,10
                const entries = ohlcInput.split("|").filter(Boolean);
                ohlcData = entries.map(entry => {
                    const [time_frame, symbol, depth] = entry.split(",").map(s => s.trim());
                    return {
                        time_frame,
                        symbol: symbol.toUpperCase(),
                        depth: parseInt(depth) || 5
                    };
                });
            }

            setMessages([]);
            await callAPI("track/ohlc", { ohlc: ohlcData }, "OHLC API");
        } catch (error) {
            alert("Invalid OHLC format. Use: M1,EURUSD,5|M5,GBPUSD,10");
        }
    };

    // Handler for track/mbook
    const handleMbookSubmit = async () => {
        const symbols = mbookInput
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean);

        await callAPI("track/mbook", { symbols }, "Market Book API");
    };

    // Handler for track/orders
    const handleOrdersSubmit = async () => {
        await callAPI("track/orders", { enabled: String(ordersEnabled) }, "Orders API");
    };

    const handleClearAll = () => {
        setSymbolsInput("");
        setOhlcInput("");
        setMbookInput("");
    };

    const tabs = [
        { id: "prices", label: "Prices", color: "blue" },
        { id: "ohlc", label: "OHLC", color: "green" },
        { id: "mbook", label: "Market Book", color: "purple" },
        { id: "orders", label: "Orders", color: "orange" }
    ];

    return (
        <div className="p-6 max-w-6xl mx-auto bg-gray-900 min-h-screen">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white mb-2">Multi-Endpoint WebSocket Streaming</h1>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
                    <span className="text-gray-300 text-sm">{isConnected ? "Connected" : "Disconnected"}</span>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="flex border-b border-gray-700">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 font-medium transition-colors ${
                                activeTab === tab.id
                                    ? `text-${tab.color}-400 border-b-2 border-${tab.color}-400`
                                    : "text-gray-400 hover:text-white"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                {activeTab === "prices" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Track Prices - /track/prices</h3>
                        <div>
                            <label className="block text-gray-300 mb-2">Symbols (comma separated):</label>
                            <input
                                type="text"
                                value={symbolsInput}
                                onChange={(e) => setSymbolsInput(e.target.value)}
                                placeholder="AAPL, MSFT, TSLA"
                                className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                                onKeyDown={(e) => e.key === "Enter" && handlePricesSubmit()}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePricesSubmit}
                                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Prices Request
                            </button>
                            <button
                                onClick={() => callAPI("track/prices", { symbols: [] }, "Prices API")}
                                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Empty Array
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === "ohlc" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Track OHLC - /track/ohlc</h3>
                        <div>
                            <label className="block text-gray-300 mb-2">OHLC Data (format: timeframe,symbol,depth | separated):</label>
                            <input
                                type="text"
                                value={ohlcInput}
                                onChange={(e) => setOhlcInput(e.target.value)}
                                placeholder="M1,EURUSD,5|M5,GBPUSD,10|H1,USDJPY,20"
                                className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:outline-none"
                                onKeyDown={(e) => e.key === "Enter" && handleOHLCSubmit()}
                            />
                            <div className="text-gray-400 text-sm mt-1">
                                Example: M1,EURUSD,5 means 1-minute timeframe, EURUSD symbol, depth 5
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleOHLCSubmit}
                                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send OHLC Request
                            </button>
                            <button
                                onClick={() => callAPI("track/ohlc", { ohlc: [] }, "OHLC API")}
                                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Empty OHLC
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === "mbook" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Track Market Book - /track/mbook</h3>
                        <div>
                            <label className="block text-gray-300 mb-2">Symbols (comma separated):</label>
                            <input
                                type="text"
                                value={mbookInput}
                                onChange={(e) => setMbookInput(e.target.value)}
                                placeholder="EURUSD, GBPUSD, USDJPY"
                                className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                                onKeyDown={(e) => e.key === "Enter" && handleMbookSubmit()}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleMbookSubmit}
                                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Market Book Request
                            </button>
                            <button
                                onClick={() => callAPI("track/mbook", { symbols: [] }, "Market Book API")}
                                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Empty Array
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === "orders" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Track Orders - /track/orders</h3>
                        <div>
                            <label className="block text-gray-300 mb-2">Orders Tracking:</label>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="orders"
                                        checked={ordersEnabled === true}
                                        onChange={() => setOrdersEnabled(true)}
                                        className="text-orange-500"
                                    />
                                    <span className="text-white">Enabled</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="orders"
                                        checked={ordersEnabled === false}
                                        onChange={() => setOrdersEnabled(false)}
                                        className="text-orange-500"
                                    />
                                    <span className="text-white">Disabled</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleOrdersSubmit}
                                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded text-white font-medium transition-colors"
                            >
                                Send Orders Request
                            </button>
                        </div>
                    </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-700">
                    <button
                        onClick={handleClearAll}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white font-medium transition-colors"
                    >
                        Clear All Messages & Inputs
                    </button>
                </div>
            </div>

            {/* Messages Display */}
            <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Live Messages ({messages.length})</h3>

                <div className="bg-black rounded p-4 h-96 overflow-auto font-mono text-sm">
                    {messages.length === 0 ? (
                        <div className="text-gray-500 text-center py-8">Waiting for messages...</div>
                    ) : (
                        messages.map(({ id, timestamp, data }) => (
                            <div key={id} className="mb-3 border-b border-gray-700 pb-2">
                                <div className="text-gray-400 text-xs mb-1">[{timestamp}]</div>
                                <pre className="text-green-400 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
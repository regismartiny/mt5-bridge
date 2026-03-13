
type WsListener = (data: any) => void;
type WsStatusListener = (isConnected: boolean) => void;

class WsService {
    private ws: WebSocket | null = null;
    private listeners: WsListener[] = [];
    private statusListeners: WsStatusListener[] = [];
    private isConnected = false;

    connect() {
        if (this.ws) {
            console.log("WsService: Already connected, skipping connect");
            return;
        }

        console.log("WsService: Creating new WebSocket connection");

        this.ws = new WebSocket("ws://127.0.0.1:8890");

        this.ws.onopen = () => {
            this.isConnected = true;
            this.notifyStatusListeners();
            console.log("WsService: WebSocket connected");
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.listeners.forEach((listener) => listener(data));
            } catch (e) {
                console.error("WsService: Failed to parse WS message:", e);
            }
        };

        this.ws.onerror = (e) => {
            console.error("WsService: WebSocket error:", e);
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.notifyStatusListeners();
            console.log("WsService: WebSocket disconnected");
            this.ws = null;
        };
    }

    disconnect() {
        if (this.ws) {
            console.log("WsService: Closing WebSocket connection");
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            this.notifyStatusListeners();
        }
    }
    addStatusListener(listener: WsStatusListener) {
        this.statusListeners.push(listener);
    }

    removeStatusListener(listener: WsStatusListener) {
        this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    }

    private notifyStatusListeners() {
        this.statusListeners.forEach((listener) => listener(this.isConnected));
    }

    addListener(listener: WsListener) {
        this.listeners.push(listener);
    }

    removeListener(listener: WsListener) {
        this.listeners = this.listeners.filter((l) => l !== listener);
    }

    getConnectedStatus() {
        return this.isConnected;
    }
}

const singletonWsService = new WsService();
export default singletonWsService;

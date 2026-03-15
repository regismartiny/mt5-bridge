const BASE_API_URL = "http://localhost:8891/v1";

async function request(endpoint: string, options: { method?: string; body?: any; params?: Record<string, string | number | boolean>; description?: string } = {}) {
    const { method = 'GET', body, params, description = endpoint } = options;
    try {
        let url = `${BASE_API_URL}/${endpoint}`;
        if (params && Object.keys(params).length) {
            url += '?' + new URLSearchParams(Object.entries(params).reduce((acc: any, [k, v]) => { acc[k] = String(v); return acc; }, {})).toString();
        }

        console.log(`Sending to ${description}:`, url);
        if (body) console.log(`Payload:`, JSON.stringify(body, null, 2));

        const response = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });

        console.log('Response status:', response.status);

        const contentType = response.headers.get('content-type') ?? '';
        let parsed: any = null;
        if (contentType.includes('application/json')) parsed = await response.json();
        else parsed = await response.text();

        if (!response.ok) {
            const errMsg = (parsed && (parsed.message || parsed.error)) || (`HTTP ${response.status} - ${String(parsed).slice(0, 200)}`);
            throw new Error(errMsg);
        }

        console.log(`${description} response:`, parsed);
        return parsed;
    } catch (error) {
        console.error(`❌ ${description} request failed:`, error);
        if (error instanceof TypeError && error.message.includes('fetch')) {
            alert(`Cannot connect to ${description} server. Make sure your server is running on localhost:8891`);
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`${description} Error: ${errorMessage}`);
        }
        throw error;
    }
}

// Backwards-compatible simple POST helper
export default async function callAPI(endpoint: string, payload: any, description = endpoint) {
    return await request(endpoint, { method: 'POST', body: payload, description });
}

// Alert-specific helpers
export async function createAlert(payload: { symbol: string; target_price: number; direction: string }) {
    return await request('alerts', { method: 'POST', body: payload, description: 'Create alert' });
}

export async function listAlerts(activeOnly = false) {
    return await request('alerts', { method: 'GET', params: activeOnly ? { active: 'true' } : undefined, description: 'List alerts' });
}

export async function getAlert(id: number) {
    return await request(`alerts/${id}`, { method: 'GET', description: 'Get alert' });
}

export async function deleteAlert(id: number) {
    return await request(`alerts/${id}`, { method: 'DELETE', description: 'Delete alert' });
}

export async function postPriceUpdate(symbol: string, price: number) {
    return await request('alerts/price-update', { method: 'POST', body: { symbol, price }, description: 'Price update for alerts' });
}
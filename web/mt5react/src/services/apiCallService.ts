const BASE_API_URL = "http://localhost:8891/v1";

/**
 * Generic API call function for POST requests.
 * @param endpoint API endpoint (relative to BASE_API_URL)
 * @param payload Request body
 * @param description Description for logging and error messages
 */
export default async function callAPI(endpoint: string, payload: any, description: string) {
    try {
        const url = `${BASE_API_URL}/${endpoint}`;
        console.log(`Sending to ${description}:`, url);
        console.log(`Payload:`, JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMessage = `HTTP ${response.status}`;

            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } else {
                const errorText = await response.text();
                console.log("Error response text:", errorText);
                if (errorText.includes("<!doctype html>") || errorText.includes("<html")) {
                    errorMessage = `${description} endpoint not found. Check if your server is running and the route exists.`;
                } else {
                    errorMessage = errorText.substring(0, 200) + "...";
                }
            }

            throw new Error(errorMessage);
        }

        const result = await response.text();
        console.log(`${description} response:`, result);
        console.log(`✅ ${description} sent successfully`);
    } catch (error) {
        console.error(`❌ ${description} request failed:`, error);

        if (error instanceof TypeError && error.message.includes("fetch")) {
            alert(`Cannot connect to ${description} server. Make sure your server is running on localhost:8891`);
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`${description} Error: ${errorMessage}`);
        }
    }
}
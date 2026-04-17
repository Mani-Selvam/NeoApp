/**
 * ⚡ Cached API Client — Single axios instance, cached token
 *
 * BEFORE: Every API call did AsyncStorage.getItem() + axios.create() = ~100-200ms overhead
 * AFTER:  Single instance reused, token cached in memory = ~0ms overhead
 */
import axios from "axios";
import { API_URL } from "./apiConfig";
import { emitAuthError } from "./authErrorBus";
import { getAuthToken } from "./secureTokenStorage";

let cachedToken = null;
let apiClient = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isLikelyNetworkError = (error) => {
    const code = String(error?.code || "").toUpperCase();
    if (code === "ERR_CANCELED") return false;
    if (code === "ERR_NETWORK" || code === "ECONNABORTED") return true;
    // Axios in React Native often uses generic "Network Error" with no response.
    return (
        !error?.response &&
        String(error?.message || "")
            .toLowerCase()
            .includes("network")
    );
};

// Create or reuse the axios instance
const getApiClient = async () => {
    const token = await getAuthToken();

    // Reuse existing client if token hasn't changed
    if (apiClient && cachedToken === token) {
        return apiClient;
    }

    // Token changed or first call — create new instance
    cachedToken = token;
    apiClient = axios.create({
        baseURL: API_URL,
        timeout: 15000, // 15s timeout
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    apiClient.interceptors.request.use((config) => {
        // For FormData (file uploads), let axios set multipart/form-data automatically
        if (config.data instanceof FormData) {
            // Remove any pre-set Content-Type so axios can set it with the proper boundary
            // IMPORTANT: Don't set Content-Type, let axios/platform handle it
            delete config.headers["Content-Type"];

            // Debug: Log FormData details
            if (__DEV__) {
                console.log("📤 FormData Request:", {
                    url: config.url,
                    method: config.method,
                    hasFormData: config.data instanceof FormData,
                });
            }
        }
        return config;
    });

    apiClient.interceptors.response.use(
        (response) => response,
        async (error) => {
            // Retry GET once on intermittent mobile network drops (Wi-Fi switch / server wake / etc.)
            try {
                const cfg = error?.config;
                const method = String(cfg?.method || "").toLowerCase();
                const canRetry =
                    method === "get" &&
                    cfg &&
                    !cfg.__isRetryRequest &&
                    (cfg.__retryCount == null || cfg.__retryCount < 1) &&
                    isLikelyNetworkError(error);

                if (canRetry) {
                    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
                    cfg.__isRetryRequest = true;
                    await sleep(650);
                    return apiClient(cfg);
                }
            } catch (_retryError) {
                // fall through to normal error handling
            }

            const status = error?.response?.status;
            const message =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                error?.message ||
                "";

            if (message) {
                error.message = message;
            }

            if (isLikelyNetworkError(error)) {
                error.message = `Network Error: cannot reach server (${API_URL}). Check Wi-Fi / server IP / VPN.`;
            }

            const code = error?.response?.data?.code;

            if (status === 402 || status === 401 || status === 403) {
                // Company suspension, inactive user, expired token, billing, etc.
                error.isAuthError = true;
                emitAuthError({
                    status,
                    message,
                    data: error?.response?.data,
                    code,
                });
            }

            return Promise.reject(error);
        },
    );

    return apiClient;
};

// Call this on logout to clear the cached client
export const clearApiClient = () => {
    cachedToken = null;
    apiClient = null;
};

export default getApiClient;

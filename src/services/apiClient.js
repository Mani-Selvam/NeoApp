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

const isTimeout = (error) => {
    const code = String(error?.code || "").toUpperCase();
    return (
        code === "ECONNABORTED" ||
        (error?.isAxiosError &&
            error?.message?.toLowerCase().includes("timeout"))
    );
};

const isLikelyNetworkError = (error) => {
    const code = String(error?.code || "").toUpperCase();
    if (code === "ERR_CANCELED") return false;
    if (code === "ECONNABORTED") return false; // timeout, not network error
    if (code === "ERR_NETWORK") return true;
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
        timeout: 15000, // 15s default timeout
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    // ✅ REQUEST INTERCEPTOR — Handle FormData (file uploads) for mobile
    apiClient.interceptors.request.use((config) => {
        if (config.data instanceof FormData) {
            // ✅ FIX: Delete Content-Type from ALL axios header layers
            // so axios/fetch can auto-set multipart/form-data WITH boundary
            // (boundary is required for mobile — missing it breaks upload)
            delete config.headers["Content-Type"];
            if (config.headers.common) {
                delete config.headers.common["Content-Type"];
            }
            if (config.headers.put) {
                delete config.headers.put["Content-Type"];
            }
            if (config.headers.post) {
                delete config.headers.post["Content-Type"];
            }

       

            // ✅ Image uploads need longer timeout (60s)
            config.timeout = 60000;

            if (__DEV__) {
                console.log("📤 FormData Upload Request:", {
                    url: config.url,
                    method: config.method,
                    hasFormData: config.data instanceof FormData,
                    timeout: config.timeout,
                });
            }
        } else {
            // Normal JSON request
            if (__DEV__ && config.url && config.url.includes("/enquiries")) {
                console.log("📝 JSON Request:", {
                    url: config.url,
                    method: config.method,
                    paramsKeys:
                        config?.params && typeof config.params === "object"
                            ? Object.keys(config.params)
                            : [],
                    paramsPreview:
                        config?.params && typeof config.params === "object"
                            ? {
                                  page: config.params.page,
                                  limit: config.params.limit,
                                  search:
                                      typeof config.params.search === "string"
                                          ? `${config.params.search.slice(0, 20)}${config.params.search.length > 20 ? "…" : ""}`
                                          : config.params.search,
                                  date: config.params.date,
                                  followUpDate: config.params.followUpDate,
                              }
                            : null,
                    bodyKeys:
                        typeof config.data === "string"
                            ? "string"
                            : Object.keys(config.data || {}),
                });
            }
        }

        return config;
    });

    // ✅ RESPONSE INTERCEPTOR — Retry + Error handling
    apiClient.interceptors.response.use(
        (response) => response,
        async (error) => {
            // Retry GET once on intermittent mobile network drops
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

            if (isTimeout(error)) {
                error.message =
                    "Request timed out. Please check your connection and try again.";
            } else if (isLikelyNetworkError(error)) {
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

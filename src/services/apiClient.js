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
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    apiClient.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error?.response?.status;
            const message =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                error?.message ||
                "";

            if (message) {
                error.message = message;
            }

            const code = error?.response?.data?.code;

            if (
                status === 402 ||
                status === 401 ||
                status === 403
            ) {
                // Company suspension, inactive user, expired token, billing, etc.
                error.isAuthError = true;
                emitAuthError({ status, message, data: error?.response?.data, code });
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

import getApiClient from "./apiClient";
import {
    buildCacheKey,
    getCacheEntry,
    invalidateCacheTags,
    isFresh,
    setCacheEntry,
} from "./appCache";
import { emitCallLogCreated } from "./appEvents";

const DEFAULT_TTL_MS = 60_000;

const buildSortedQuery = (params = {}) => {
    const entries = Object.entries(params || {}).filter(
        ([, v]) => v !== undefined && v !== null && String(v) !== "",
    );
    entries.sort(([a], [b]) => String(a).localeCompare(String(b)));
    const qs = new URLSearchParams();
    for (const [k, v] of entries) qs.set(k, String(v));
    return qs.toString();
};

export const getCallLogs = async (params = {}, options = {}) => {
    const { force = false, ttlMs = DEFAULT_TTL_MS } = options || {};
    const query = buildSortedQuery(params);
    const cacheKey = buildCacheKey("calllogs:v1", query || "all");

    if (!force) {
        const cached = await getCacheEntry(cacheKey).catch(() => null);
        if (cached?.value && isFresh(cached, ttlMs)) {
            return cached.value;
        }
        if (cached?.value) {
            // Stale-while-revalidate: return stale immediately, refresh cache in background.
            Promise.resolve()
                .then(async () => {
                    const client = await getApiClient();
                    const response = await client.get(`/calllogs?${query}`);
                    await setCacheEntry(cacheKey, response.data, { tags: ["calllogs"] }).catch(() => {});
                })
                .catch(() => {});
            return cached.value;
        }
    }

    const client = await getApiClient();
    const response = await client.get(`/calllogs?${query}`);
    await setCacheEntry(cacheKey, response.data, { tags: ["calllogs"] }).catch(() => {});
    return response.data;
};

export const createCallLog = async (callData) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs`, callData);
    Promise.resolve(invalidateCacheTags(["calllogs", "reports"])).catch(() => {});
    emitCallLogCreated(response.data);
    return response.data;
};

export const getCallStats = async (params = {}) => {
    const client = await getApiClient();
    const query = new URLSearchParams(params).toString();
    const response = await client.get(`/calllogs/stats?${query}`);
    return response.data;
};

export const identifyCaller = async (phoneNumber) => {
    const client = await getApiClient();
    const response = await client.get(`/calllogs/identify/${phoneNumber}`);
    return response.data;
};

export const syncCallLogs = async (logs) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs/sync-batch`, { logs });
    const data = response.data;

    const synced = Number(data?.synced || data?.syncCount || 0);
    if (synced > 0) {
        Promise.resolve(invalidateCacheTags(["calllogs", "reports"])).catch(
            () => {},
        );
        emitCallLogCreated({ type: "BATCH_SYNC", synced });
    }
    return data;
};

export const createCallSession = async (sessionData) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs/session`, sessionData);
    return response.data;
};

export const updateCallSessionControl = async (sessionId, controlData) => {
    const client = await getApiClient();
    const response = await client.patch(
        `/calllogs/session/${sessionId}/control`,
        controlData,
    );
    return response.data;
};

export const endCallSession = async (sessionId, payload = {}) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs/session/${sessionId}/end`, payload);
    return response.data;
};

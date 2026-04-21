import getApiClient from "./apiClient";
import { buildCacheKey, getCacheEntry, invalidateCacheTags, isFresh, setCacheEntry } from "./appCache";
import { emitFollowupChanged } from "./appEvents";

const DEFAULT_TTL_MS = Number(process.env.EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_MS || 60000);

const normalizeEnquiryKey = (value) => {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") {
        const s = String(value).trim();
        return s && s !== "[object Object]" ? s : "";
    }
    if (typeof value === "object") {
        const id =
            value?._id ||
            value?.enqId ||
            value?.enquiryId ||
            value?.id ||
            value?.enqNo ||
            "";
        const s = String(id || "").trim();
        return s && s !== "[object Object]" ? s : "";
    }
    const s = String(value).trim();
    return s && s !== "[object Object]" ? s : "";
};

// GET FOLLOWUPS (with tab filter and pagination)
export const getFollowUps = async (
    tab = "Today",
    page = 1,
    limit = 20,
    selectedDate = "",
    extraParams = {},
) => {
    try {
        const client = await getApiClient();
        const params = { tab, page, limit };
        if (selectedDate) params.date = selectedDate;
        // Let the server compute "today"/missed using the device timezone in production.
        if (params.tzOffsetMinutes == null) {
            params.tzOffsetMinutes = new Date().getTimezoneOffset();
        }
        if (extraParams && typeof extraParams === "object") {
            Object.assign(params, extraParams);
        }
        const response = await client.get("/followups", {
            params,
        });
        return response.data; // Now returns { data: [], pagination: {} }
    } catch (error) {
        console.error(
            "Get followups error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// CREATE FOLLOWUP
export const createFollowUp = async (followUpData) => {
    try {
        const client = await getApiClient();
        const payload = {
            ...(followUpData || {}),
        };
        if (payload.tzOffsetMinutes == null) {
            payload.tzOffsetMinutes = new Date().getTimezoneOffset();
        }
        const response = await client.post("/followups", payload);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "followups", "enquiries", "reports"]),
        ).catch(() => {});
        emitFollowupChanged({
            action: "create",
            item: response.data,
        });
        return response.data;
    } catch (error) {
        console.error(
            "Create followup error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE FOLLOWUP
export const updateFollowUp = async (id, followUpData) => {
    try {
        const client = await getApiClient();
        const payload = {
            ...(followUpData || {}),
        };
        if (payload.tzOffsetMinutes == null) {
            payload.tzOffsetMinutes = new Date().getTimezoneOffset();
        }
        const response = await client.put(`/followups/${id}`, payload);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "followups", "enquiries", "reports"]),
        ).catch(() => {});
        emitFollowupChanged({
            action: "update",
            item: response.data,
        });
        return response.data;
    } catch (error) {
        const status = Number(error?.response?.status || 0);
        const log = status === 404 ? console.warn : console.error;
        log("Update followup error:", error.response?.data || error.message);
        throw error;
    }
};

// DELETE FOLLOWUP
export const deleteFollowUp = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/followups/${id}`);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "followups", "enquiries", "reports"]),
        ).catch(() => {});
        emitFollowupChanged({
            action: "delete",
            id,
        });
        return response.data;
    } catch (error) {
        const status = Number(error?.response?.status || 0);
        const log = status === 404 ? console.warn : console.error;
        log("Delete followup error:", error.response?.data || error.message);
        throw error;
    }
};

// GET FOLLOW-UP HISTORY (all records for an enquiry)
export const getFollowUpHistory = async (enqNoOrId, options = {}) => {
    try {
        const { force = false, ttlMs = DEFAULT_TTL_MS } = options || {};
        const normalizedKey = normalizeEnquiryKey(enqNoOrId);
        if (!normalizedKey) throw new Error("Invalid enquiry id");
        const key = buildCacheKey("followups:history:v2", normalizedKey);

        if (!force) {
            const cached = await getCacheEntry(key).catch(() => null);
            if (cached?.value && isFresh(cached, ttlMs)) return cached.value;
            if (cached?.value) {
                Promise.resolve()
                    .then(async () => {
                        const client = await getApiClient();
                        const response = await client.get(
                            `/followups/history/${encodeURIComponent(normalizedKey)}`,
                        );
                        await setCacheEntry(key, response.data, { tags: ["followups"] }).catch(() => {});
                    })
                    .catch(() => {});
                return cached.value;
            }
        }

        const client = await getApiClient();
        const response = await client.get(
            `/followups/history/${encodeURIComponent(normalizedKey)}`,
        );
        await setCacheEntry(key, response.data, { tags: ["followups"] }).catch(() => {});
        return response.data;
    } catch (error) {
        console.error(
            "Get follow-up history error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
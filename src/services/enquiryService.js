import getApiClient from "./apiClient";
import { emitEnquiryCreated, emitEnquiryUpdated } from "./appEvents";
import {
    buildCacheKey,
    getCacheEntry,
    invalidateCacheTags,
    isFresh,
    setCacheEntry,
} from "./appCache";

const DEFAULT_TTL_MS = Number(process.env.EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS || 60000);
const RECENT_DEDUP_WINDOW_MS = 900;
const _inflightGetAllEnquiries = new Map();
const _recentGetAllEnquiries = new Map();

const stableStringify = (value) => {
    const seen = new WeakSet();
    const normalize = (v) => {
        if (!v || typeof v !== "object") return v;
        if (seen.has(v)) return undefined;
        seen.add(v);
        if (Array.isArray(v)) return v.map(normalize);
        const out = {};
        for (const key of Object.keys(v).sort()) out[key] = normalize(v[key]);
        return out;
    };
    try {
        return JSON.stringify(normalize(value));
    } catch {
        try {
            return String(value);
        } catch {
            return "";
        }
    }
};

// CREATE ENQUIRY
export const createEnquiry = async (enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/enquiries", enquiryData);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "enquiries", "followups", "reports"]),
        ).catch(() => {});
        emitEnquiryCreated(response.data);
        return response.data;
    } catch (error) {
        console.error(
            "Create enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ALL ENQUIRIES
export const getAllEnquiries = async (
    page = 1,
    limit = 20,
    search = "",
    status = "",
    date = "",
    followUpDate = "",
    extraParams = {},
) => {
    try {
        const client = await getApiClient();
        const params = { page, limit };
        if (search) params.search = search;
        if (status) params.status = status;
        if (date) params.date = date;
        if (followUpDate) params.followUpDate = followUpDate;
        if (extraParams && typeof extraParams === "object") {
            Object.assign(params, extraParams);
        }

        const authKey =
            String(client?.defaults?.headers?.Authorization || "").trim() ||
            "no-auth";
        const key = buildCacheKey(
            "enquiries:list:v1",
            `${authKey}|${stableStringify(params)}`,
        );
        const now = Date.now();
        const recent = _recentGetAllEnquiries.get(key);
        if (recent && now - Number(recent.t || 0) < RECENT_DEDUP_WINDOW_MS) {
            return recent.value;
        }

        const inflight = _inflightGetAllEnquiries.get(key);
        if (inflight) return await inflight;

        const promise = (async () => {
            const response = await client.get("/enquiries", { params });
            _recentGetAllEnquiries.set(key, { t: Date.now(), value: response.data });
            if (_recentGetAllEnquiries.size > 200) {
                const cutoff = Date.now() - 5 * 60 * 1000;
                for (const [k, v] of _recentGetAllEnquiries.entries()) {
                    if (Number(v?.t || 0) < cutoff) _recentGetAllEnquiries.delete(k);
                }
            }
            return response.data; // Now returns { data: [], pagination: {} } or [] if legacy
        })();

        _inflightGetAllEnquiries.set(key, promise);
        try {
            return await promise;
        } finally {
            _inflightGetAllEnquiries.delete(key);
        }
    } catch (error) {
        console.error(
            "Get enquiries error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET SINGLE ENQUIRY
export const getEnquiryById = async (id, options = {}) => {
    try {
        const { force = false, ttlMs = DEFAULT_TTL_MS } = options || {};
        const key = buildCacheKey("enquiry:byId:v1", String(id || ""));

        if (!force) {
            const cached = await getCacheEntry(key).catch(() => null);
            if (cached?.value && isFresh(cached, ttlMs)) return cached.value;
            if (cached?.value) {
                Promise.resolve()
                    .then(async () => {
                        const client = await getApiClient();
                        const response = await client.get(`/enquiries/${id}`);
                        await setCacheEntry(key, response.data, { tags: ["enquiries"] }).catch(
                            () => {},
                        );
                    })
                    .catch(() => {});
                return cached.value;
            }
        }

        const client = await getApiClient();
        const response = await client.get(`/enquiries/${id}`);
        await setCacheEntry(key, response.data, { tags: ["enquiries"] }).catch(
            () => {},
        );
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ENQUIRY DETAIL (enquiry + timeline + reminders)
export const getEnquiryDetail = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/enquiries/${id}/detail`);
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiry detail error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE ENQUIRY
export const updateEnquiry = async (id, enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/enquiries/${id}`, enquiryData);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "enquiries", "followups", "reports"]),
        ).catch(() => {});
        emitEnquiryUpdated(response.data);
        return response.data;
    } catch (error) {
        // Backward-compatible retry for older backend enum sets.
        const errMessage =
            error?.response?.data?.message || error?.message || "";
        const statusValue = enquiryData?.status;
        const isEnumError =
            typeof errMessage === "string" &&
            errMessage.toLowerCase().includes("not a valid enum value") &&
            String(errMessage).toLowerCase().includes("status");

        if (isEnumError && statusValue) {
            let legacyStatus = null;
            if (statusValue === "Contacted") legacyStatus = "In Progress";
            if (statusValue === "Not Interested") legacyStatus = "Dropped";

            if (legacyStatus) {
                try {
                    const client = await getApiClient();
                    const retryResponse = await client.put(`/enquiries/${id}`, {
                        ...enquiryData,
                        status: legacyStatus,
                    });
                    Promise.resolve(
                        invalidateCacheTags(["dashboard", "enquiries", "followups", "reports"]),
                    ).catch(() => {});
                    emitEnquiryUpdated(retryResponse.data);
                    return retryResponse.data;
                } catch (retryError) {
                    console.error(
                        "Update enquiry retry error:",
                        retryError.response?.data || retryError.message,
                    );
                }
            }
        }

        console.error(
            "Update enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// QUICK STATUS UPDATE
export const updateEnquiryStatus = async (id, status) => {
    try {
        const client = await getApiClient();
        const response = await client.patch(`/enquiries/${id}/status`, { status });
        Promise.resolve(
            invalidateCacheTags(["dashboard", "enquiries", "followups", "reports"]),
        ).catch(() => {});
        emitEnquiryUpdated(response.data);
        return response.data;
    } catch (error) {
        console.error(
            "Update enquiry status error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// FOLLOW-UP REMINDERS (today + overdue handled in UI when needed)
export const getFollowUpReminders = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/enquiries/meta/reminders");
        return response.data;
    } catch (error) {
        console.error(
            "Get follow-up reminders error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

export const getFollowUpStatusSummary = async (followUpDate = "") => {
    try {
        const client = await getApiClient();
        const params = {};
        if (followUpDate) params.followUpDate = followUpDate;
        const response = await client.get("/enquiries/meta/followup-status-summary", {
            params,
        });
        return response.data;
    } catch (error) {
        console.error(
            "Get follow-up status summary error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// DELETE ENQUIRY
export const deleteEnquiry = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/enquiries/${id}`);
        Promise.resolve(
            invalidateCacheTags(["dashboard", "enquiries", "followups", "reports"]),
        ).catch(() => {});
        emitEnquiryUpdated({ action: "delete", id });
        return response.data;
    } catch (error) {
        console.error(
            "Delete enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ENQUIRIES BY STATUS
export const getEnquiriesByStatus = async (status) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/enquiries/status/${status}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiries by status error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

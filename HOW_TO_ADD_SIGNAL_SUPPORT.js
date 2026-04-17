/**
 * How to Add Signal Support to API Services
 *
 * To support request cancellation, all API service methods need to:
 * 1. Accept a `signal` parameter
 * 2. Pass it to axios/fetch calls
 * 3. Handle AbortError gracefully
 */

// ============================================
// EXAMPLE: enquiryService.js - UPDATED
// ============================================

import getApiClient from "./apiClient";
import {
    buildCacheKey,
    getCacheEntry,
    invalidateCacheTags,
    isFresh,
    setCacheEntry,
} from "./appCache";

const DEFAULT_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS || 60000,
);

// CREATE ENQUIRY
export const createEnquiry = async (enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/enquiries", enquiryData);
        Promise.resolve(
            invalidateCacheTags([
                "dashboard",
                "enquiries",
                "followups",
                "reports",
            ]),
        ).catch(() => {});
        return response.data;
    } catch (error) {
        console.error(
            "Create enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ALL ENQUIRIES - WITH SIGNAL SUPPORT ✨
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

        // Extract signal from extraParams if present
        const { signal, ...otherParams } = extraParams || {};

        const params = { page, limit };
        if (search) params.search = search;
        if (status) params.status = status;
        if (date) params.date = date;
        if (followUpDate) params.followUpDate = followUpDate;
        if (otherParams && typeof otherParams === "object") {
            Object.assign(params, otherParams);
        }

        // Pass signal to axios if available
        const config = signal ? { params, signal } : { params };
        const response = await client.get("/enquiries", config);

        return response.data;
    } catch (error) {
        // Handle AbortError silently (expected when request cancelled)
        if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
            console.log("[Enquiry] Request cancelled");
            return null; // Return null for cancelled requests
        }

        console.error(
            "Get enquiries error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET SINGLE ENQUIRY - WITH SIGNAL SUPPORT ✨
export const getEnquiryById = async (id, options = {}) => {
    try {
        const {
            force = false,
            ttlMs = DEFAULT_TTL_MS,
            signal = null, // Add signal parameter
        } = options || {};

        const key = buildCacheKey("enquiry:byId:v1", String(id || ""));

        if (!force) {
            const cached = await getCacheEntry(key).catch(() => null);
            if (cached?.value && isFresh(cached, ttlMs)) return cached.value;
            if (cached?.value) {
                Promise.resolve()
                    .then(async () => {
                        const client = await getApiClient();
                        const response = await client.get(
                            `/enquiries/${id}`,
                            signal ? { signal } : {},
                        );
                        await setCacheEntry(key, response.data, {
                            tags: ["enquiries"],
                        }).catch(() => {});
                    })
                    .catch(() => {});
                return cached.value;
            }
        }

        const client = await getApiClient();
        const response = await client.get(
            `/enquiries/${id}`,
            signal ? { signal } : {},
        );
        await setCacheEntry(key, response.data, { tags: ["enquiries"] }).catch(
            () => {},
        );
        return response.data;
    } catch (error) {
        // Handle AbortError silently
        if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
            console.log("[Enquiry] Request cancelled");
            return null;
        }

        console.error(
            "Get enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE ENQUIRY
export const updateEnquiry = async (id, updateData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/enquiries/${id}`, updateData);
        Promise.resolve(
            invalidateCacheTags(["enquiries", "dashboard", "reports"]),
        ).catch(() => {});
        return response.data;
    } catch (error) {
        console.error(
            "Update enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// ============================================
// EXAMPLE: dashboardService.js - UPDATED
// ============================================

const DASHBOARD_CACHE_TTL = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS || 60000,
);

export const getDashboardData = async (companyId, options = {}) => {
    try {
        const { signal = null } = options || {}; // Add signal parameter

        const client = await getApiClient();
        const config = signal ? { signal } : {};

        const response = await client.get(`/dashboard/${companyId}`, config);
        return response.data;
    } catch (error) {
        // Handle AbortError silently
        if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
            console.log("[Dashboard] Request cancelled");
            return null;
        }

        console.error(
            "Get dashboard error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// ============================================
// EXAMPLE: followupService.js - UPDATED
// ============================================

export const getFollowups = async (page = 1, limit = 20, options = {}) => {
    try {
        const { signal = null, ...otherParams } = options || {}; // Add signal

        const client = await getApiClient();
        const params = { page, limit, ...otherParams };

        const config = signal ? { params, signal } : { params };
        const response = await client.get("/followups", config);

        return response.data;
    } catch (error) {
        // Handle AbortError silently
        if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
            console.log("[Followup] Request cancelled");
            return null;
        }

        console.error(
            "Get followups error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// ============================================
// PATTERN: How to Add Signal to Any Service
// ============================================

/*
1. Add signal parameter to function:
   export const myService = async (id, options = {}) => {
     const { signal = null } = options || {};
     ...
   }

2. Pass signal to axios:
   const config = signal ? { signal } : {};
   const response = await client.get("/endpoint", config);

3. Handle abort errors:
   } catch (error) {
     if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
       console.log("[Service] Request cancelled");
       return null;
     }
     throw error;
   }

4. Use in hooks:
   queryFn: async ({ signal }) => {
     return myService(id, { signal });
   }
*/

// ============================================
// TESTING: How to Test Signal Support
// ============================================

/*
import { useAutoRefresh } from "../hooks/useAutoRefresh";

export default function TestScreen() {
  const { data, loading, error } = useAutoRefresh({
    queryKey: ["test"],
    queryFn: async ({ signal }) => {
      console.log("Query started, signal:", signal);
      try {
        const result = await enquiryService.getAllEnquiries(1, 10, "", "", "", "", { signal });
        console.log("Query completed, result:", result);
        return result;
      } catch (err) {
        console.error("Query error:", err.name, err.message);
        throw err;
      }
    },
    ttlMs: 60000,
    autoRefreshIntervalMs: 0,
  });

  return (
    <View>
      {loading && <Text>Loading...</Text>}
      {error && <Text>Error: {error.message}</Text>}
      {data && <Text>Data: {JSON.stringify(data)}</Text>}
    </View>
  );
}

// When component unmounts or new request made:
// 1. Old signal will be aborted
// 2. Request will be cancelled
// 3. AbortError will be thrown (and caught)
// 4. UI won't update (request was cancelled)
*/

// ============================================
// MIGRATION CHECKLIST
// ============================================

/*
Services to Update:

- [ ] enquiryService.js
  - getAllEnquiries() - add signal
  - getEnquiryById() - add signal

- [ ] followupService.js
  - getFollowups() - add signal
  - getFollowupById() - add signal

- [ ] dashboardService.js
  - getDashboardData() - add signal

- [ ] callLogService.js
  - getCallLogs() - add signal
  - getCallLogById() - add signal

- [ ] userService.js
  - getUserProfile() - add signal
  - getCompanyProfile() - add signal

- [ ] Other services
  - Search for GET requests
  - Add signal parameter to all of them
  - Handle AbortError in catch blocks

Quick Find: Search for "client.get(" or "client.post(" to find all API calls
*/

module.exports = {
    createEnquiry,
    getAllEnquiries,
    getEnquiryById,
    updateEnquiry,
};

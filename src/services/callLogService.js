import AsyncStorage from "@react-native-async-storage/async-storage";
import getApiClient from "./apiClient";
import { emitAppEvent } from "./appEvents";

const CACHE_KEY = "calllog_last_sync_time";

/**
 * Transform raw Android CallLog data to CRM schema
 * @param {Array} rawLogs - Raw call logs from react-native-call-log
 * @returns {Array} Transformed logs
 */
const transformCallData = (rawLogs) => {
    if (!Array.isArray(rawLogs)) return [];

    return rawLogs.map((log) => {
        // Map Android types to CRM types
        let callType = "incoming";
        if (log.type === "OUTGOING" || log.type === 1) {
            callType = "outgoing";
        } else if (log.type === "MISSED" || log.type === 2) {
            callType = "missed";
        } else if (log.type === "INCOMING" || log.type === 0) {
            callType = "incoming";
        } else if (log.type === "REJECTED" || log.type === 4) {
            callType = "rejected";
        } else if (log.type === "BLOCKED" || log.type === 5) {
            callType = "rejected";
        }

        // Handle duration = 0 as rejected/ringing cut
        if (log.duration === "0" || log.duration === 0) {
            if (callType === "incoming") {
                callType = "rejected";
            }
        }

        const callTime = log.dateTime
            ? new Date(parseInt(log.dateTime, 10))
            : new Date();

        return {
            phoneNumber: (log.phoneNumber || "").trim(),
            callType,
            callDuration: parseInt(log.duration || 0, 10),
            callTime: callTime.toISOString(),
            contactName: log.name || "",
        };
    });
};

/**
 * Generate unique key for duplicate prevention
 * @param {string} phoneNumber
 * @param {string} callTime ISO string or timestamp
 * @param {number} duration seconds
 * @returns {string} Unique key
 */
const generateUniqueKey = (phoneNumber, callTime, duration) => {
    const ts =
        typeof callTime === "string" ? new Date(callTime).getTime() : callTime;
    return `${phoneNumber}_${ts}_${duration}`;
};

/**
 * Filter new logs based on last sync time
 * @param {Array} logs - Transformed logs
 * @param {number|null} lastSyncTime - Timestamp in ms
 * @returns {Array} Logs newer than lastSyncTime
 */
const filterNewLogs = (logs, lastSyncTime) => {
    if (!lastSyncTime) return logs;

    return logs.filter((log) => {
        const logTime = new Date(log.callTime).getTime();
        return logTime > lastSyncTime;
    });
};

/**
 * Get last sync timestamp from local storage
 * @returns {Promise<number|null>}
 */
export const getLastSyncTime = async () => {
    try {
        const stored = await AsyncStorage.getItem(CACHE_KEY);
        if (!stored) return null;
        return parseInt(stored, 10);
    } catch (err) {
        console.warn("Error reading lastSyncTime:", err);
        return null;
    }
};

/**
 * Set last sync timestamp in local storage
 * @param {number} timestamp - Milliseconds since epoch
 * @returns {Promise<void>}
 */
export const setLastSyncTime = async (timestamp) => {
    try {
        await AsyncStorage.setItem(CACHE_KEY, String(timestamp));
    } catch (err) {
        console.warn("Error saving lastSyncTime:", err);
    }
};

/**
 * Sync device call logs to backend
 * Requires react-native-call-log to be installed
 * @returns {Promise<{success: boolean, inserted: number, duplicates: number}>}
 */
export const syncDeviceCallLogs = async () => {
    try {
        console.log("[CallLog] Sync started");

        // Dynamically require react-native-call-log (will fail gracefully if not available)
        let CallLogs;
        try {
            CallLogs = require("react-native-call-log").default;
        } catch {
            console.error("[CallLog] react-native-call-log not installed");
            return {
                success: false,
                error: "CallLog library not available",
            };
        }

        // Fetch device call logs
        const rawLogs = await CallLogs.loadAll();
        console.log(`[CallLog] Fetched ${rawLogs.length} logs from device`);

        if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
            console.log("[CallLog] No logs to sync");
            return { success: true, inserted: 0, duplicates: 0 };
        }

        // Transform logs
        const transformedLogs = transformCallData(rawLogs);
        console.log(`[CallLog] Transformed ${transformedLogs.length} logs`);

        // Get last sync time and filter new logs only
        const lastSyncTime = await getLastSyncTime();
        const newLogs = filterNewLogs(transformedLogs, lastSyncTime);
        console.log(
            `[CallLog] Found ${newLogs.length} new logs since last sync`,
        );

        if (newLogs.length === 0) {
            console.log("[CallLog] No new logs to sync");
            return { success: true, inserted: 0, duplicates: 0 };
        }

        // Post to backend
        const client = await getApiClient();
        const result = await client.post("/calllogs/sync", { logs: newLogs });

        if (result.success) {
            // Update last sync time
            const now = new Date().getTime();
            await setLastSyncTime(now);

            console.log(
                `[CallLog] Sync complete. Inserted: ${result.inserted}, Duplicates: ${result.duplicates}`,
            );

            // Emit event for UI refresh
            if (result.inserted > 0) {
                emitAppEvent("CALL_LOG_SYNCED", {
                    count: result.inserted,
                    timestamp: now,
                });
            }

            return result;
        }

        return {
            success: false,
            error: result.error || "Sync failed",
        };
    } catch (err) {
        console.error("[CallLog] Sync error:", err);
        return {
            success: false,
            error: err.message,
        };
    }
};

/**
 * Fetch call logs for a specific phone number
 * @param {string} phoneNumber - Phone number to filter by
 * @param {string} callType - Filter by type (optional): incoming, outgoing, missed, rejected
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 50)
 * @returns {Promise<{success: boolean, data: Array, pagination: object}>}
 */
export const getCallLogsByPhone = async (
    phoneNumber,
    callType = null,
    page = 1,
    limit = 50,
) => {
    try {
        const params = {
            phone: phoneNumber,
            page,
            limit,
        };

        if (callType) {
            params.callType = callType;
        }

        console.log("[CallLogService] 🚀 Making request with params:", params);

        const client = await getApiClient();
        const result = await client.get("/calllogs", { params });

        console.log("[CallLogService] 📦 Raw response:", {
            status: result.status,
            statusText: result.statusText,
            data: result.data,
        });

        if (result.data?.success !== false) {
            return {
                success: true,
                data: result.data?.data || result.data || [],
                pagination: result.data?.pagination || {},
            };
        }

        return {
            success: false,
            error:
                result.data?.error ||
                result.data?.message ||
                "Failed to fetch call logs",
            data: [],
        };
    } catch (err) {
        console.error("[CallLogService] ❌ Request error:", {
            message: err.message,
            status: err?.response?.status,
            statusText: err?.response?.statusText,
            data: err?.response?.data,
            error: err,
        });

        const errorMessage =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err.message ||
            "Failed to fetch call logs";

        return {
            success: false,
            error: errorMessage,
            data: [],
        };
    }
};

/**
 * Format call duration to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "2m 15s" or "45s")
 */
export const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return "0s";

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
};

/**
 * Format call date/time for display
 * @param {string|Date} callTime ISO string or Date object
 * @returns {object} {date: "Apr 18", time: "2:30 PM"}
 */
export const formatCallTime = (callTime) => {
    try {
        const dt = new Date(callTime);
        const date = dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
        const time = dt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
        return { date, time };
    } catch (err) {
        return { date: "N/A", time: "N/A" };
    }
};

export default {
    syncDeviceCallLogs,
    getCallLogsByPhone,
    getLastSyncTime,
    setLastSyncTime,
    transformCallData,
    filterNewLogs,
    generateUniqueKey,
    formatDuration,
    formatCallTime,
};

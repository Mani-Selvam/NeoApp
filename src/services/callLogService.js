/**
 * callLogService.js
 * Frontend service for call log syncing and fetching.
 * Works with react-native-call-log on Android (enterprise builds only).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import getApiClient from "./apiClient";
import { emitAppEvent } from "./appEvents";

const CACHE_KEY = "calllog_last_sync_time";

// ─── Transforms ───────────────────────────────────────────────────────────────

/**
 * Map Android call log type values to CRM enum strings.
 * Android numeric types: 0 = INCOMING, 1 = OUTGOING, 2 = MISSED, 3 = VOICEMAIL, 4 = REJECTED, 5 = BLOCKED
 */
const transformCallData = (rawLogs) => {
    if (!Array.isArray(rawLogs)) return [];

    return rawLogs
        .filter((log) => log && log.phoneNumber) // skip logs with no number
        .map((log) => {
            const typeRaw = log.type;

            let callType = "incoming";
            if (typeRaw === "OUTGOING" || typeRaw === 1 || typeRaw === "1") {
                callType = "outgoing";
            } else if (
                typeRaw === "MISSED" ||
                typeRaw === 2 ||
                typeRaw === "2"
            ) {
                callType = "missed";
            } else if (
                typeRaw === "INCOMING" ||
                typeRaw === 0 ||
                typeRaw === "0"
            ) {
                callType = "incoming";
            } else if (
                typeRaw === "REJECTED" ||
                typeRaw === 4 ||
                typeRaw === "4" ||
                typeRaw === "BLOCKED" ||
                typeRaw === 5 ||
                typeRaw === "5"
            ) {
                callType = "rejected";
            }

            const durationSec = parseInt(log.duration || 0, 10);

            // Zero-duration incoming → treat as rejected/missed-ring
            if (durationSec === 0 && callType === "incoming") {
                callType = "rejected";
            }

            // Zero-duration outgoing → still counts as outgoing (rang, they didn't pick up)

            // Parse callTime safely — handle invalid dates
            let callTime = new Date();
            if (log.dateTime) {
                const parsed = parseInt(log.dateTime, 10);
                if (!Number.isNaN(parsed) && parsed > 0) {
                    const dt = new Date(parsed);
                    if (!Number.isNaN(dt.getTime())) {
                        callTime = dt;
                    }
                }
            }

            return {
                phoneNumber: String(log.phoneNumber || "").trim(),
                callType,
                callDuration: durationSec, // ← IMPORTANT: backend field is callDuration
                callTime: callTime.toISOString(),
                contactName: String(log.name || "").trim(),
            };
        });
};

/**
 * Build a unique key per call to prevent duplicate syncs.
 */
const generateUniqueKey = (phoneNumber, callTime, callDuration) => {
    const ts =
        typeof callTime === "string"
            ? new Date(callTime).getTime()
            : Number(callTime);
    const phone = String(phoneNumber || "")
        .replace(/\D/g, "")
        .slice(-10);
    return `${phone}_${ts}_${callDuration}`;
};

/**
 * Keep only logs newer than the last successful sync timestamp.
 */
const filterNewLogs = (logs, lastSyncTime) => {
    if (!lastSyncTime) return logs;
    return logs.filter((log) => {
        const logTime = new Date(log.callTime).getTime();
        return logTime > lastSyncTime;
    });
};

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

export const getLastSyncTime = async () => {
    try {
        const stored = await AsyncStorage.getItem(CACHE_KEY);
        if (!stored) return null;
        const parsed = parseInt(stored, 10);
        return Number.isFinite(parsed) ? parsed : null;
    } catch (err) {
        console.warn(
            "[CallLogService] Error reading lastSyncTime:",
            err.message,
        );
        return null;
    }
};

export const setLastSyncTime = async (timestamp) => {
    try {
        await AsyncStorage.setItem(CACHE_KEY, String(timestamp));
    } catch (err) {
        console.warn(
            "[CallLogService] Error saving lastSyncTime:",
            err.message,
        );
    }
};

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Sync device call logs to backend.
 * Requires react-native-call-log and READ_CALL_LOG permission.
 * Safe to call even when the library is unavailable — returns gracefully.
 *
 * @returns {Promise<{success: boolean, inserted?: number, duplicates?: number, error?: string}>}
 */
export const syncDeviceCallLogs = async () => {
    try {
        console.log("[CallLogService] Sync started");

        let CallLogs;
        try {
            CallLogs = require("react-native-call-log").default;
        } catch {
            console.error(
                "[CallLogService] react-native-call-log not installed",
            );
            return { success: false, error: "CallLog library not available" };
        }

        if (!CallLogs?.loadAll) {
            return { success: false, error: "CallLog.loadAll not available" };
        }

        // Fetch all device logs (react-native-call-log returns an array)
        const rawLogs = await CallLogs.loadAll();
        console.log(
            `[CallLogService] Fetched ${rawLogs?.length ?? 0} logs from device`,
        );

        if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
            return { success: true, inserted: 0, duplicates: 0 };
        }

        // Transform → CRM schema
        const transformedLogs = transformCallData(rawLogs);
        console.log(
            `[CallLogService] Transformed → ${transformedLogs.length} logs`,
        );

        // Filter to only new logs since last sync
        const lastSyncTime = await getLastSyncTime();
        const newLogs = filterNewLogs(transformedLogs, lastSyncTime);
        console.log(`[CallLogService] New since last sync: ${newLogs.length}`);

        if (newLogs.length === 0) {
            return { success: true, inserted: 0, duplicates: 0 };
        }

        // POST to backend
        const client = await getApiClient();
        const response = await client.post("/calllogs/sync", { logs: newLogs });

        // apiClient may return response.data directly or wrap it
        const result = response?.data ?? response;

        if (result?.success !== false) {
            const now = Date.now();
            await setLastSyncTime(now);

            const inserted = Number(result?.inserted ?? 0);
            const duplicates = Number(result?.duplicates ?? 0);

            console.log(
                `[CallLogService] Sync complete — inserted: ${inserted}, duplicates: ${duplicates}`,
            );

            if (inserted > 0) {
                emitAppEvent("CALL_LOG_SYNCED", {
                    count: inserted,
                    timestamp: now,
                });
            }

            return { success: true, inserted, duplicates };
        }

        return {
            success: false,
            error: result?.error || result?.message || "Sync failed",
        };
    } catch (err) {
        console.error("[CallLogService] Sync error:", err.message);
        return { success: false, error: err.message };
    }
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch call logs for a specific phone number from the backend.
 *
 * @param {string}      phoneNumber
 * @param {string|null} callType    - "incoming"|"outgoing"|"missed"|"rejected"|null (all)
 * @param {number}      page        - default 1
 * @param {number}      limit       - default 50
 * @returns {Promise<{success:boolean, data:Array, pagination:object}>}
 */
export const getCallLogsByPhone = async (
    phoneNumber,
    callType = null,
    page = 1,
    limit = 50,
) => {
    try {
        if (!phoneNumber || !String(phoneNumber).trim()) {
            return {
                success: false,
                error: "Phone number is required",
                data: [],
            };
        }

        const params = {
            phone: String(phoneNumber).trim(),
            page: Number(page) || 1,
            limit: Number(limit) || 50,
        };

        if (callType && callType !== "all" && callType !== "All") {
            params.callType = callType;
        }

        console.log("[CallLogService] Fetching logs with params:", params);

        const client = await getApiClient();
        const response = await client.get("/calllogs", { params });

        // Handle both axios (response.data) and custom apiClient patterns
        const body = response?.data ?? response;

        console.log("[CallLogService] Response body:", {
            success: body?.success,
            count:
                body?.data?.length ?? (Array.isArray(body) ? body.length : "?"),
        });

        if (body?.success === false) {
            return {
                success: false,
                error:
                    body?.error || body?.message || "Failed to fetch call logs",
                data: [],
            };
        }

        // data may be at body.data (paginated) or body itself (array)
        const data = Array.isArray(body?.data)
            ? body.data
            : Array.isArray(body)
              ? body
              : [];

        return {
            success: true,
            data,
            pagination: body?.pagination || {},
        };
    } catch (err) {
        console.error("[CallLogService] Fetch error:", {
            message: err.message,
            status: err?.response?.status,
            data: err?.response?.data,
        });

        const errorMessage =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err.message ||
            "Failed to fetch call logs";

        return { success: false, error: errorMessage, data: [] };
    }
};

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format seconds to "2m 15s", "45s", "0s"
 */
export const formatDuration = (seconds) => {
    const total = Number(seconds ?? 0);
    if (!total || total < 0) return "0s";

    const mins = Math.floor(total / 60);
    const secs = total % 60;

    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
};

/**
 * Format a callTime ISO string to {date: "Apr 18", time: "2:30 PM"}
 */
export const formatCallTime = (callTime) => {
    try {
        if (!callTime) return { date: "N/A", time: "N/A" };
        const dt = new Date(callTime);
        if (Number.isNaN(dt.getTime())) return { date: "N/A", time: "N/A" };

        const date = dt.toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
        });
        const time = dt.toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
        return { date, time };
    } catch {
        return { date: "N/A", time: "N/A" };
    }
};

// ─── Default export (for callLogService.methodName usage) ─────────────────────

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

import {
    isEnterpriseMode,
    hasCallLogPermission,
} from "../utils/callLogPermissions";
import callLogService from "./callLogService";

// Configuration
const SYNC_INTERVAL_MIN = 5; // 5 minutes
let taskId = null;
let BackgroundFetch = null;

// Lazy-load BackgroundFetch only when needed
const getBackgroundFetch = async () => {
    if (BackgroundFetch) return BackgroundFetch;

    try {
        BackgroundFetch = await import("react-native-background-fetch").then(
            (m) => m.default || m,
        );
        return BackgroundFetch;
    } catch (err) {
        console.warn(
            "[BackgroundSync] BackgroundFetch not available:",
            err.message,
        );
        return null;
    }
};

/**
 * Background sync task handler
 * Called every 5 minutes to sync device call logs
 */
const handleBackgroundSync = async () => {
    try {
        console.log("[BackgroundSync] Task started");

        // Double-check we should be running
        if (!isEnterpriseMode()) {
            console.log("[BackgroundSync] Enterprise mode disabled, skipping");
            return;
        }

        const hasPermission = await hasCallLogPermission();
        if (!hasPermission) {
            console.log("[BackgroundSync] Permission not granted, skipping");
            return;
        }

        // Perform sync
        const result = await callLogService.syncDeviceCallLogs();

        if (result.success) {
            console.log(
                `[BackgroundSync] Sync completed. Inserted: ${result.inserted}`,
            );
        } else {
            console.warn("[BackgroundSync] Sync failed:", result.error);
        }

        // Finish the task
        const BGFetch = await getBackgroundFetch();
        if (BGFetch?.finish) {
            BGFetch.finish(BGFetch.FETCH_RESULT_NEW_DATA);
        }
    } catch (err) {
        console.error("[BackgroundSync] Error:", err);
        const BGFetch = await getBackgroundFetch();
        if (BGFetch?.finish) {
            BGFetch.finish(BGFetch.FETCH_RESULT_FAILED);
        }
    }
};

/**
 * Setup background sync
 * Only call if enterprise mode + permission granted
 */
export const setupBackgroundSync = async () => {
    try {
        // Check prerequisites
        if (!isEnterpriseMode()) {
            console.log("[BackgroundSync] Skipping setup - Safe mode enabled");
            return false;
        }

        const hasPermission = await hasCallLogPermission();
        if (!hasPermission) {
            console.log(
                "[BackgroundSync] Skipping setup - Permission not granted",
            );
            return false;
        }

        // Get BackgroundFetch
        const BGFetch = await getBackgroundFetch();
        if (!BGFetch) {
            console.warn("[BackgroundSync] BackgroundFetch unavailable");
            return false;
        }

        // Configure background fetch
        const status = await BGFetch.configure(
            {
                minimumFetchInterval: SYNC_INTERVAL_MIN,
                stopOnTerminate: false, // Continue syncing even if app is killed
                startOnBoot: true, // Start sync on device boot
                enableHeadless: true, // Support headless mode
                requiredNetworkType: BGFetch.NETWORK_TYPE_ANY,
                requiresBatteryNotLow: false,
                requiresDeviceIdle: false,
                requiresStorageNotLow: false,
            },
            handleBackgroundSync,
            (error) => {
                // Handle timeout/error
                console.error("[BackgroundSync] Configuration error:", error);
            },
        );

        console.log("[BackgroundSync] Configured with status:", status);
        return true;
    } catch (err) {
        console.error("[BackgroundSync] Setup error:", err);
        return false;
    }
};

/**
 * Cancel background sync
 */
export const cancelBackgroundSync = async () => {
    try {
        const BGFetch = await getBackgroundFetch();
        if (BGFetch?.stop) {
            await BGFetch.stop();
            console.log("[BackgroundSync] Stopped");
        }
        return true;
    } catch (err) {
        console.warn("[BackgroundSync] Stop error:", err);
        return false;
    }
};

/**
 * Trigger manual foreground sync
 * (User taps "Sync Now" button)
 */
export const triggerManualSync = async () => {
    try {
        console.log("[BackgroundSync] Manual sync triggered");

        if (!isEnterpriseMode()) {
            return {
                success: false,
                error: "Safe mode enabled",
            };
        }

        const hasPermission = await hasCallLogPermission();
        if (!hasPermission) {
            return {
                success: false,
                error: "Permission not granted",
            };
        }

        const result = await callLogService.syncDeviceCallLogs();
        return result;
    } catch (err) {
        console.error("[BackgroundSync] Manual sync error:", err);
        return {
            success: false,
            error: err.message,
        };
    }
};

export default {
    setupBackgroundSync,
    cancelBackgroundSync,
    triggerManualSync,
};

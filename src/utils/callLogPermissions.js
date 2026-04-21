/**
 * callLogPermissions.js
 * Manages READ_CALL_LOG permission for enterprise Android builds.
 *
 * PLAY_STORE_SAFE_MODE=true  → call log features disabled (safe for Play Store review)
 * PLAY_STORE_SAFE_MODE=false → enterprise mode, call log features enabled
 */
import { PermissionsAndroid, Platform } from "react-native";

// ─── Mode detection ───────────────────────────────────────────────────────────

const PLAY_STORE_SAFE_MODE =
    String(process.env.EXPO_PUBLIC_PLAY_STORE_SAFE_MODE ?? "true")
        .trim()
        .toLowerCase() === "true";

/**
 * Returns true when the app is in enterprise mode (call logs enabled).
 * Set EXPO_PUBLIC_PLAY_STORE_SAFE_MODE=false in your .env for enterprise builds.
 */
export const isEnterpriseMode = () => !PLAY_STORE_SAFE_MODE;

/**
 * Returns true when running on Android.
 */
export const isAndroid = () => Platform.OS === "android";

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Request READ_CALL_LOG permission (Android enterprise only).
 *
 * @returns {Promise<{granted: boolean, reason: string}>}
 */
export const requestCallLogPermission = async () => {
    if (!isAndroid()) {
        return { granted: false, reason: "iOS does not support READ_CALL_LOG" };
    }

    if (!isEnterpriseMode()) {
        return {
            granted: false,
            reason: "Safe mode enabled — call log disabled",
        };
    }

    try {
        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            {
                title: "Call Log Access",
                message:
                    "This app needs access to your call logs to automatically " +
                    "track customer call history against enquiries.",
                buttonNeutral: "Ask Me Later",
                buttonNegative: "Deny",
                buttonPositive: "Allow",
            },
        );

        const granted = result === PermissionsAndroid.RESULTS.GRANTED;
        let reason;
        if (granted) {
            reason = "Permission granted";
        } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            reason =
                "Permission permanently denied — enable in device Settings > App > Permissions";
        } else {
            reason = "Permission denied by user";
        }

        return { granted, reason };
    } catch (err) {
        console.error(
            "[CallLogPermissions] requestCallLogPermission error:",
            err,
        );
        return { granted: false, reason: err.message };
    }
};

/**
 * Check if READ_CALL_LOG is already granted without prompting the user.
 *
 * @returns {Promise<boolean>}
 */
export const hasCallLogPermission = async () => {
    if (!isAndroid()) return false;
    if (!isEnterpriseMode()) return false;

    try {
        return await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        );
    } catch (err) {
        console.error("[CallLogPermissions] hasCallLogPermission error:", err);
        return false;
    }
};

/**
 * Full check: enterprise mode + Android + permission granted.
 * Use this before loading or syncing call logs.
 *
 * @returns {Promise<boolean>}
 */
export const isCallLogEnabled = async () => {
    if (!isEnterpriseMode()) return false;
    if (!isAndroid()) return false;
    return hasCallLogPermission();
};

/**
 * Request permission if not already granted, then return enabled status.
 * Use this on first launch or when the user enables the feature.
 *
 * @returns {Promise<{enabled: boolean, reason: string}>}
 */
export const requestAndCheckCallLog = async () => {
    if (!isEnterpriseMode()) {
        return { enabled: false, reason: "Safe mode enabled" };
    }
    if (!isAndroid()) {
        return { enabled: false, reason: "iOS not supported" };
    }

    const already = await hasCallLogPermission();
    if (already) return { enabled: true, reason: "Already granted" };

    const { granted, reason } = await requestCallLogPermission();
    return { enabled: granted, reason };
};

/**
 * Detailed status object — useful for debugging / settings screens.
 *
 * @returns {Promise<{enabled: boolean, enterprise: boolean, android: boolean, permitted: boolean}>}
 */
export const getPermissionStatus = async () => {
    const enterprise = isEnterpriseMode();
    const android = isAndroid();
    const permitted =
        enterprise && android ? await hasCallLogPermission() : false;
    const enabled = enterprise && android && permitted;

    return { enabled, enterprise, android, permitted };
};

export default {
    isEnterpriseMode,
    isAndroid,
    requestCallLogPermission,
    hasCallLogPermission,
    isCallLogEnabled,
    requestAndCheckCallLog,
    getPermissionStatus,
};

import { PermissionsAndroid, Platform } from "react-native";

const PLAY_STORE_SAFE_MODE =
    process.env.EXPO_PUBLIC_PLAY_STORE_SAFE_MODE === "true";

/**
 * Check if app is running in enterprise mode (call log features enabled)
 * @returns {boolean} True if enterprise mode (PLAY_STORE_SAFE_MODE=false)
 */
export const isEnterpriseMode = () => {
    return !PLAY_STORE_SAFE_MODE;
};

/**
 * Check if running on Android
 * @returns {boolean}
 */
export const isAndroid = () => {
    return Platform.OS === "android";
};

/**
 * Request READ_CALL_LOG permission (Android only)
 * @returns {Promise<{granted: boolean, reason: string}>}
 */
export const requestCallLogPermission = async () => {
    try {
        // Only relevant on Android
        if (!isAndroid()) {
            return { granted: true, reason: "Not Android platform" };
        }

        // Not needed for Safe Mode
        if (!isEnterpriseMode()) {
            return { granted: false, reason: "Safe mode enabled" };
        }

        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            {
                title: "Call Log Permission",
                message:
                    "This app needs access to your call logs to track customer interactions.",
                buttonNeutral: "Ask Me Later",
                buttonNegative: "Cancel",
                buttonPositive: "OK",
            },
        );

        const granted = result === PermissionsAndroid.RESULTS.GRANTED;
        return {
            granted,
            reason: granted
                ? "Permission granted"
                : result === PermissionsAndroid.RESULTS.DENIED
                  ? "Permission denied by user"
                  : "Permission denied by system",
        };
    } catch (err) {
        console.error("[CallLogPermissions] Request error:", err);
        return {
            granted: false,
            reason: err.message,
        };
    }
};

/**
 * Check if READ_CALL_LOG permission is already granted
 * @returns {Promise<boolean>}
 */
export const hasCallLogPermission = async () => {
    try {
        // Not relevant on iOS
        if (!isAndroid()) {
            return false;
        }

        // Never grant for Safe Mode
        if (!isEnterpriseMode()) {
            return false;
        }

        const result = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        );

        return result;
    } catch (err) {
        console.error("[CallLogPermissions] Check error:", err);
        return false;
    }
};

/**
 * Check if call log features should be enabled
 * Checks: Enterprise mode + Android + Permission granted
 * @returns {Promise<boolean>}
 */
export const isCallLogEnabled = async () => {
    if (!isEnterpriseMode()) {
        return false;
    }

    if (!isAndroid()) {
        return false;
    }

    const hasPermission = await hasCallLogPermission();
    return hasPermission;
};

/**
 * Get permission status object
 * @returns {Promise<{enabled: boolean, enterprise: boolean, android: boolean, permitted: boolean}>}
 */
export const getPermissionStatus = async () => {
    const enterprise = isEnterpriseMode();
    const android = isAndroid();
    const permitted = await hasCallLogPermission();
    const enabled = enterprise && android && permitted;

    return {
        enabled,
        enterprise,
        android,
        permitted,
    };
};

export default {
    isEnterpriseMode,
    isAndroid,
    requestCallLogPermission,
    hasCallLogPermission,
    isCallLogEnabled,
    getPermissionStatus,
};

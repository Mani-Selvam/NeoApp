import { PermissionsAndroid, Platform } from "react-native";

export const isAndroid = () => Platform.OS === "android";

/**
 * Request CALL_PHONE permission (Android only).
 * Without this, `android.intent.action.CALL` will fail and we must fall back to `tel:`.
 *
 * @returns {Promise<{granted: boolean, reason: string}>}
 */
export const requestPhoneCallPermission = async () => {
    if (!isAndroid()) {
        return { granted: false, reason: "iOS does not support CALL_PHONE" };
    }

    try {
        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            {
                title: "Phone Call Permission",
                message:
                    "Allow this app to directly place calls to customers from inside the app.",
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
                "Permission permanently denied — enable in Settings > App > Permissions";
        } else {
            reason = "Permission denied by user";
        }

        return { granted, reason };
    } catch (err) {
        console.error(
            "[PhoneCallPermissions] requestPhoneCallPermission error:",
            err,
        );
        return { granted: false, reason: err?.message || "Permission error" };
    }
};

export const hasPhoneCallPermission = async () => {
    if (!isAndroid()) return false;
    try {
        return await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        );
    } catch (err) {
        console.error(
            "[PhoneCallPermissions] hasPhoneCallPermission error:",
            err,
        );
        return false;
    }
};

/**
 * Checks permission and requests if needed.
 *
 * @returns {Promise<{granted: boolean, reason: string}>}
 */
export const ensurePhoneCallPermission = async () => {
    if (!isAndroid()) {
        return { granted: false, reason: "iOS does not support CALL_PHONE" };
    }

    const already = await hasPhoneCallPermission();
    if (already) return { granted: true, reason: "Already granted" };
    return requestPhoneCallPermission();
};

export default {
    isAndroid,
    requestPhoneCallPermission,
    hasPhoneCallPermission,
    ensurePhoneCallPermission,
};


import { PermissionsAndroid, Platform } from "react-native";

/**
 * Ensures we have the CALL_PHONE permission for direct dialing.
 * Only applies to Android.
 * @returns {Promise<{granted: boolean, status: string}>}
 */
export async function ensurePhoneCallPermission() {
    if (Platform.OS !== "android") {
        return { granted: false, status: "unsupported" };
    }

    try {
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.CALL_PHONE
        );

        if (hasPermission) {
            return { granted: true, status: "granted" };
        }

        const status = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            {
                title: "Call Permission",
                message: "This app needs access to make phone calls directly.",
                buttonNeutral: "Ask Me Later",
                buttonNegative: "Cancel",
                buttonPositive: "OK",
            }
        );

        return {
            granted: status === PermissionsAndroid.RESULTS.GRANTED,
            status,
        };
    } catch (err) {
        console.warn("[ensurePhoneCallPermission] Error:", err);
        return { granted: false, status: "error" };
    }
}

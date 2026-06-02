import { Alert } from "react-native";

const NETWORK_ERROR_CODES = new Set([
    "ECONNABORTED",
    "ERR_NETWORK",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ETIMEDOUT",
]);

export const getUserFacingError = (
    error,
    fallback = "Something went wrong. Please try again.",
) => {
    const status = error?.response?.status;
    const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "";
    const code = String(error?.code || "").toUpperCase();

    if (!error?.response || NETWORK_ERROR_CODES.has(code) || /network error/i.test(message)) {
        return "No internet connection. Please try again.";
    }

    if (status === 408 || code === "ECONNABORTED" || /timeout/i.test(message)) {
        return "The request took too long. Please try again.";
    }

    return message || fallback;
};

export const confirmPermissionRequest = ({
    title,
    message,
    confirmText = "Continue",
    cancelText = "Not now",
}) =>
    new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        Alert.alert(
            title,
            message,
            [
                {
                    text: cancelText,
                    style: "cancel",
                    onPress: () => finish(false),
                },
                {
                    text: confirmText,
                    onPress: () => finish(true),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => finish(false),
            },
        );
    });
